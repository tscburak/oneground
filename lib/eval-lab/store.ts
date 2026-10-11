import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../lab/store";
import { PRESETS } from "../presets";

export const EVAL_RESOURCES = ["datasets", "profiles", "runs"] as const;
export type EvalResource = (typeof EVAL_RESOURCES)[number];

export type EvalLibraryEntry = {
  id: string;
  name: string;
  createdAt: string;
  data: unknown;
};

const MAX_ENTRIES = 20;

export function initEvalTables() {
  db().exec(
    "CREATE TABLE IF NOT EXISTS eval_datasets (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS eval_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS eval_runs (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);",
  );
  const seed = PRESETS.find((preset) => preset.name === "Support ticket");
  if (!seed) return;
  const count = db()
    .prepare("SELECT COUNT(*) AS count FROM eval_profiles")
    .get() as { count: number };
  if (count.count > 0) return;
  db()
    .prepare("INSERT OR IGNORE INTO eval_profiles VALUES (?,?,?,?)")
    .run(
      "seed-support-ticket",
      seed.name,
      new Date(0).toISOString(),
      JSON.stringify({ drafts: seed.questions }),
    );
}

function tableFor(resource: EvalResource): string {
  return resource === "datasets"
    ? "eval_datasets"
    : resource === "profiles"
      ? "eval_profiles"
      : "eval_runs";
}

export function parseResource(value: unknown): EvalResource {
  const parsed = z.enum(EVAL_RESOURCES).safeParse(value);
  if (!parsed.success) throw new Error("Unknown eval library resource.");
  return parsed.data;
}

function toEntry(row: {
  id: string;
  name: string;
  created_at: string;
  body: string;
}): EvalLibraryEntry {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    data: JSON.parse(row.body),
  };
}

export function listEvalEntries(resource: EvalResource): EvalLibraryEntry[] {
  initEvalTables();
  const rows = db()
    .prepare(
      `SELECT id,name,created_at,body FROM ${tableFor(resource)} ORDER BY created_at DESC`,
    )
    .all() as { id: string; name: string; created_at: string; body: string }[];
  return rows.map(toEntry);
}

export function createEvalEntry(
  resource: EvalResource,
  input: { name: unknown; data: unknown },
): EvalLibraryEntry {
  initEvalTables();
  const name = z.string().trim().min(1).max(160).parse(input.name);
  const body = JSON.stringify(input.data ?? {});
  if (body.length > 5_000_000)
    throw new Error("Eval library entry is too large.");
  const entry: EvalLibraryEntry = {
    id: randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    data: JSON.parse(body),
  };
  db()
    .transaction(() => {
      db()
        .prepare(
          `INSERT INTO ${tableFor(resource)} VALUES (?,?,?,?)`,
        )
        .run(entry.id, entry.name, entry.createdAt, body);
      db()
        .prepare(
          `DELETE FROM ${tableFor(resource)} WHERE id NOT IN (SELECT id FROM ${tableFor(resource)} ORDER BY created_at DESC LIMIT ${MAX_ENTRIES})`,
        )
        .run();
    })
    .immediate();
  return entry;
}

export function updateEvalEntry(
  resource: EvalResource,
  input: { id: unknown; name: unknown; data: unknown },
): EvalLibraryEntry {
  initEvalTables();
  const id = z.string().min(1).max(200).parse(input.id);
  const name = z.string().trim().min(1).max(160).parse(input.name);
  const body = JSON.stringify(input.data ?? {});
  if (body.length > 5_000_000)
    throw new Error("Eval library entry is too large.");
  const table = tableFor(resource);
  const result = db()
    .transaction(() => {
      const changed = db()
        .prepare(`UPDATE ${table} SET name=?, body=? WHERE id=?`)
        .run(name, body, id);
      if (changed.changes === 0)
        throw new Error("Eval library entry not found.");
      return db()
        .prepare(`SELECT id,name,created_at,body FROM ${table} WHERE id=?`)
        .get(id) as {
        id: string;
        name: string;
        created_at: string;
        body: string;
      };
    })
    .immediate();
  return toEntry(result);
}

export function deleteEvalEntry(resource: EvalResource, id: string): void {
  initEvalTables();
  const cleanId = z.string().min(1).max(200).parse(id);
  db()
    .prepare(`DELETE FROM ${tableFor(resource)} WHERE id=?`)
    .run(cleanId);
}
