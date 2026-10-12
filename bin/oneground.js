#!/usr/bin/env node
// OneGround launcher. Starts the prebuilt standalone server when present
// (published npm package / Docker build context), else falls back to
// `next start` for source checkouts. No runtime dependencies.
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { existsSync, readFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");

const APP_ROOT = resolve(dirname(__filename), "..");
const DEFAULT_PORT = 3180;
const DEFAULT_HOSTNAME = "127.0.0.1";

function fail(message) {
  process.stderr.write(`oneground: ${message}\n`);
  process.exit(1);
}

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    fail(
      `Node.js >=22.5 required, found ${process.versions.node}. See https://nodejs.org.`,
    );
  }
}

function help() {
  return `Usage: oneground [options]

Start the local OneGround workspace (Playground + Eval Lab).

Options:
  -p, --port <n>      Port to listen on (default: 3180, env: PORT)
  -H, --hostname <h>  Hostname to bind (default: 127.0.0.1, env: HOSTNAME)
      --db-path <p>   SQLite file location (env: ONEGROUND_DB_PATH)
      --open          Open the workspace in the default browser
  -h, --help          Show this help
  -v, --version       Show the version

Data lives in a per-user SQLite file (override with --db-path):
  Linux:   ~/.local/share/oneground/oneground.sqlite ($XDG_DATA_HOME respected)
  macOS:   ~/Library/Application Support/oneground/oneground.sqlite
  Windows: %APPDATA%\\oneground\\oneground.sqlite

Back up the .sqlite file plus its adjacent .settings.key (master key).
Use a SQLite-aware backup (VACUUM INTO / .backup), never plain cp of WAL files.
`;
}

function parseArgs(argv) {
  const out = { port: undefined, hostname: undefined, dbPath: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(help());
      process.exit(0);
    }
    if (arg === "-v" || arg === "--version") {
      const pkg = JSON.parse(
        readFileSync(join(APP_ROOT, "package.json"), "utf8"),
      );
      process.stdout.write(`${pkg.version ?? "0.0.0"}\n`);
      process.exit(0);
    }
    if (arg === "--open") {
      out.open = true;
      continue;
    }
    if (arg === "-p" || arg === "--port") out.port = Number(argv[++i]);
    else if (arg === "-H" || arg === "--hostname") out.hostname = argv[++i];
    else if (arg === "--db-path") out.dbPath = argv[++i];
    else if (arg.startsWith("--port=")) out.port = Number(arg.split("=")[1]);
    else if (arg.startsWith("--hostname=")) out.hostname = arg.split("=")[1];
    else if (arg.startsWith("--db-path=")) out.dbPath = arg.split("=")[1];
    else fail(`unknown argument: ${arg}\n${help()}`);
  }
  return out;
}

function portFree(port, hostname) {
  return new Promise((resolveFree) => {
    const server = createServer();
    server.once("error", () => resolveFree(false));
    server.listen(port, hostname, () => server.close(() => resolveFree(true)));
  });
}

async function pickPort(wanted, hostname, explicit) {
  for (let port = wanted; port < wanted + 10; port++) {
    if (await portFree(port, hostname)) {
      if (port !== wanted)
        process.stdout.write(
          `oneground: port ${wanted} busy, using ${port}\n`,
        );
      return port;
    }
    if (explicit) fail(`port ${wanted} is already in use.`);
  }
  fail(`no free port found starting at ${wanted}.`);
}

function serverTarget(port, hostname) {
  const standalone = join(APP_ROOT, ".next", "standalone", "server.js");
  if (existsSync(standalone)) {
    return {
      command: process.execPath,
      args: [standalone],
      cwd: join(APP_ROOT, ".next", "standalone"),
      mode: "standalone",
    };
  }
  const nextBin = join(APP_ROOT, "node_modules", "next", "dist", "bin", "next");
  if (existsSync(nextBin) && existsSync(join(APP_ROOT, ".next", "BUILD_ID"))) {
    return {
      command: process.execPath,
      args: [nextBin, "start", "-p", String(port), "-H", hostname],
      cwd: APP_ROOT,
      mode: "next-start",
    };
  }
  fail(
    "no production build found (.next/ missing). " +
      "Source checkout: run `npm run build` first. " +
      "Published package: reinstall `npm i -g oneground` / `npx oneground`.",
  );
}

function openBrowser(url) {
  const { platform } = process;
  const child =
    platform === "darwin"
      ? spawn("open", [url], { stdio: "ignore", detached: true })
      : platform === "win32"
        ? spawn("cmd", ["/c", "start", '""', url], {
            stdio: "ignore",
            detached: true,
          })
        : spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

async function waitReady(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok || response.status < 500) return true;
    } catch {
      // Server not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  checkNode();
  const args = parseArgs(process.argv.slice(2));
  const explicitPort = args.port !== undefined;
  const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
  const wanted = args.port ?? envPort ?? DEFAULT_PORT;
  if (!Number.isInteger(wanted) || wanted < 1 || wanted > 65535)
    fail(`invalid port: ${wanted}`);
  const hostname =
    args.hostname ?? process.env.HOSTNAME ?? DEFAULT_HOSTNAME;
  if (args.dbPath) process.env.ONEGROUND_DB_PATH = args.dbPath;

  const port = await pickPort(wanted, hostname, explicitPort);
  const target = serverTarget(port, hostname);
  const child = spawn(target.command, target.args, {
    cwd: target.cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: hostname,
      NODE_ENV: "production",
    },
  });
  const forward = (signal) => child.kill(signal);
  process.on("SIGINT", forward);
  process.on("SIGTERM", forward);
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });

  const displayHost = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;
  const url = `http://${displayHost}:${port}/en`;
  process.stdout.write(
    `OneGround (${target.mode}) running at ${url}\n` +
      `Database: ${process.env.ONEGROUND_DB_PATH ?? "<user-data default>"}\n`,
  );
  if (args.open) {
    if (await waitReady(url)) openBrowser(url);
    else process.stderr.write("oneground: server did not start in time.\n");
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
