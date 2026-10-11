// Copies public/ and .next/static/ into .next/standalone/ so the minimal
// standalone server (docs: output: 'standalone') serves them. Cross-platform
// replacement for `cp -r`. No-op when no standalone build exists.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) process.exit(0);

const pairs = [
  [join(root, "public"), join(standalone, "public")],
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
];
for (const [src, dest] of pairs) {
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
}
console.log("[oneground] standalone assets copied");
