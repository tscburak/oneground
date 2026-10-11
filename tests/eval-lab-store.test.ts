import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../lib/lab/store";
import {
  createEvalEntry,
  deleteEvalEntry,
  listEvalEntries,
  parseResource,
  updateEvalEntry,
} from "../lib/eval-lab/store";

const directory = mkdtempSync(join(tmpdir(), "oneground-eval-store-")),
  path = join(directory, "eval.sqlite");
process.env.ONEGROUND_DB_PATH = path;
after(() => {
  db().close();
  unlinkSync(path);
  if (existsSync(join(directory, ".settings.key")))
    unlinkSync(join(directory, ".settings.key"));
  rmdirSync(directory);
});
test("Eval library stores datasets, profiles and runs per resource", () => {
  const dataset = createEvalEntry("datasets", {
    name: "Urgency",
    data: { format: "json", fileName: "u.json", rawText: "[]" },
  });
  const profile = createEvalEntry("profiles", {
    name: "Urgency v1",
    data: { drafts: [{ id: "urgent", kind: "noul" }] },
  });
  const run = createEvalEntry("runs", {
    name: "Run 1",
    data: { datasetName: "Urgency", rowCount: 5, results: [] },
  });
  assert.equal(listEvalEntries("datasets").length, 1);
  const seeded = listEvalEntries("profiles").find(
    (row) => row.name === "Support ticket",
  );
  assert.ok(seeded);
  const seedDrafts = (seeded?.data as { drafts: { id: string }[] }).drafts;
  assert.deepEqual(
    seedDrafts.slice(0, 1).map((draft) => draft.id),
    ["department"],
  );
  assert.deepEqual(listEvalEntries("profiles")[0].data, {
    drafts: [{ id: "urgent", kind: "noul" }],
  });
  assert.equal(listEvalEntries("runs")[0].name, "Run 1");
  deleteEvalEntry("datasets", dataset.id);
  assert.equal(listEvalEntries("datasets").length, 0);
  assert.equal(listEvalEntries("profiles").length, 2);
  assert.equal(listEvalEntries("runs").length, 1);
  void profile;
  void run;
});
test("Eval library updates entries and reports missing ones", () => {
  const entry = createEvalEntry("profiles", {
    name: "Editable",
    data: { drafts: [] },
  });
  const updated = updateEvalEntry("profiles", {
    id: entry.id,
    name: "Edited",
    data: { drafts: [{ id: "q1", kind: "noul" }] },
  });
  assert.equal(updated.id, entry.id);
  assert.equal(updated.name, "Edited");
  assert.deepEqual(listEvalEntries("profiles").find((row) => row.id === entry.id)?.data, {
    drafts: [{ id: "q1", kind: "noul" }],
  });
  assert.throws(
    () => updateEvalEntry("profiles", { id: "missing", name: "x", data: {} }),
    /not found/,
  );
  deleteEvalEntry("profiles", entry.id);
});
test("Eval library rejects unknown resources and caps entries at twenty", () => {
  assert.throws(() => parseResource("nope"), /Unknown eval library/);
  assert.throws(
    () => createEvalEntry("profiles", { name: "  ", data: {} }),
    Error,
  );
  for (let i = 0; i < 22; i += 1)
    createEvalEntry("profiles", { name: `bulk ${i}`, data: {} });
  const entries = listEvalEntries("profiles");
  assert.ok(entries.length <= 20);
});
