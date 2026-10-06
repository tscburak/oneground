import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

let database: Database.Database | undefined;
export function databasePath() {
  return resolve(
    /* turbopackIgnore: true */ process.env.ONEGROUND_DB_PATH ||
      "data/oneground.sqlite",
  );
}
export function db() {
  if (!database?.open) {
    const path = databasePath();
    mkdirSync(dirname(path), { recursive: true });
    database = new Database(path);
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
  }
  return database;
}
