import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
export function databasePath() {
  return resolve(
    /* turbopackIgnore: true */ process.env.ONEGROUND_DB_PATH ||
      "data/oneground.sqlite",
  );
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
