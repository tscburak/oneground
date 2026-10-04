import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Dataset, Run, RunItem, RunSummary, Schema } from "./types";

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
    database.exec(`CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL, status TEXT NOT NULL, lease INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS items (run_id TEXT NOT NULL, row_id TEXT NOT NULL, evaluator_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,row_id,evaluator_id));`);
  }
  return database;
}
export function saveEntity(
  kind: "dataset" | "schema",
  value: Dataset | Schema,
) {
  db()
    .prepare("INSERT INTO entities VALUES (?,?,?,?)")
    .run(value.id, kind, value.createdAt, JSON.stringify(value));
}
export function listEntities<T>(kind: string): T[] {
  return (
    db()
      .prepare("SELECT body FROM entities WHERE kind=? ORDER BY created DESC")
      .all(kind) as { body: string }[]
  ).map((row) => JSON.parse(row.body));
}
export function getEntity<T>(id: string, kind: string): T {
  const row = db()
    .prepare("SELECT body FROM entities WHERE id=? AND kind=?")
    .get(id, kind) as { body: string } | undefined;
  if (!row) throw new Error("Record not found.");
  return JSON.parse(row.body);
}
export function createRun(run: Run) {
  db().transaction(() => {
    db()
      .prepare("INSERT INTO jobs (id,body,status) VALUES (?,?,?)")
      .run(run.id, JSON.stringify({ ...run, items: [] }), run.status);
    const insert = db().prepare("INSERT INTO items VALUES (?,?,?,?)");
    for (const item of run.items)
      insert.run(run.id, item.rowId, item.evaluatorId, JSON.stringify(item));
  })();
}
export function getRun(id: string): Run {
  const row = db()
    .prepare("SELECT body,status FROM jobs WHERE id=?")
    .get(id) as { body: string; status: Run["status"] } | undefined;
  if (!row) throw new Error("Run not found.");
  const items = (
    db()
      .prepare("SELECT body FROM items WHERE run_id=? ORDER BY rowid")
      .all(id) as { body: string }[]
  ).map((row) => JSON.parse(row.body));
  return { ...JSON.parse(row.body), status: row.status, items };
}
export function getStatus(id: string): Run["status"] {
  return (
    db().prepare("SELECT status FROM jobs WHERE id=?").get(id) as {
      status: Run["status"];
    }
  ).status;
}
export function listRuns(): RunSummary[] {
  const rows = db()
    .prepare(
      `SELECT jobs.body,jobs.status,COUNT(items.row_id) AS total,
    SUM(CASE WHEN json_extract(items.body,'$.status') IN ('done','error') THEN 1 ELSE 0 END) AS progress
    FROM jobs LEFT JOIN items ON jobs.id=items.run_id GROUP BY jobs.id ORDER BY jobs.rowid DESC LIMIT 100`,
    )
    .all() as {
    body: string;
    status: Run["status"];
    progress: number;
    total: number;
  }[];
  return rows.map((row) => {
    const run: Run = JSON.parse(row.body);
    return {
      id: run.id,
      name: run.name,
      createdAt: run.createdAt,
      dataset: { id: run.dataset.id, name: run.dataset.name },
      schema: run.schema,
      evaluators: run.evaluators,
      policy: run.policy,
      parentId: run.parentId,
      replay: run.replay,
      status: row.status,
      progress: row.progress,
      total: row.total,
    };
  });
}
export function saveItem(runId: string, item: RunItem) {
  db()
    .prepare(
      "UPDATE items SET body=? WHERE run_id=? AND row_id=? AND evaluator_id=?",
    )
    .run(JSON.stringify(item), runId, item.rowId, item.evaluatorId);
}
export function setStatus(id: string, status: Run["status"]) {
  db()
    .prepare(
      `UPDATE jobs SET status=?${status === "cancelled" ? "" : ",lease=0"} WHERE id=?`,
    )
    .run(status, id);
}
export function claimRun(): string | undefined {
  return db()
    .transaction(() => {
      const row = db()
        .prepare(
          "SELECT id FROM jobs WHERE status='queued' OR (status='running' AND lease < ?) ORDER BY rowid LIMIT 1",
        )
        .get(Date.now() - 60_000) as { id: string } | undefined;
      if (!row) return;
      db()
        .prepare("UPDATE jobs SET status='running',lease=? WHERE id=?")
        .run(Date.now(), row.id);
      return row.id;
    })
    .immediate();
}
