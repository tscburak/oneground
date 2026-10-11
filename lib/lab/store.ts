import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

type TransactionMode = "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE";

class Database extends DatabaseSync {
  private depth = 0;
  transaction<T>(fn: () => T) {
    const run =
      (mode: TransactionMode) =>
      (): T => {
        const nested = this.depth > 0;
        const savepoint = `savepoint_${this.depth}`;
        this.exec(nested ? `SAVEPOINT ${savepoint}` : `BEGIN ${mode}`);
        this.depth += 1;
        try {
          const result = fn();
          this.exec(nested ? `RELEASE ${savepoint}` : "COMMIT");
          this.depth -= 1;
          return result;
        } catch (error) {
          this.depth -= 1;
          try {
            this.exec(
              nested
                ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`
                : "ROLLBACK",
            );
          } catch {
            // Keep the original error; rollback failure is secondary.
          }
          throw error;
        }
      };
    return {
      deferred: run("DEFERRED"),
      immediate: run("IMMEDIATE"),
      exclusive: run("EXCLUSIVE"),
    };
  }
}

let database: Database | undefined;
// Writable per-user default. Published installs (npm -g, npx, Docker,
// single binary) must not write inside the installed package directory,
// so fall back to an OS-specific user-data dir unless ONEGROUND_DB_PATH
// is set. Repo checkouts keep working: set ONEGROUND_DB_PATH=data/...
// for a project-local database.
export function defaultDatabasePath() {
  if (process.platform === "win32") {
    const base =
      /* turbopackIgnore: true */ process.env.APPDATA ||
      join(homedirOrTmp(), "AppData", "Roaming");
    return join(base, "oneground", "oneground.sqlite");
  }
  if (process.platform === "darwin") {
    return join(
      homedirOrTmp(),
      "Library",
      "Application Support",
      "oneground",
      "oneground.sqlite",
    );
  }
  const base =
    /* turbopackIgnore: true */ process.env.XDG_DATA_HOME ||
    join(homedirOrTmp(), ".local", "share");
  return join(base, "oneground", "oneground.sqlite");
}
function homedirOrTmp() {
  try {
    return homedir();
  } catch {
    return tmpdir();
  }
}
export function databasePath() {
  const override =
    /* turbopackIgnore: true */ process.env.ONEGROUND_DB_PATH?.trim();
  if (override) return resolve(override);
  return defaultDatabasePath();
}
export function db() {
  if (!database?.isOpen) {
    const path = databasePath();
    mkdirSync(dirname(path), { recursive: true });
    database = new Database(path);
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA busy_timeout = 5000");
  }
  return database;
}
