import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimRun,
  createRun,
  db,
  getRun,
  getStatus,
  listRuns,
  saveItem,
  setStatus,
} from "../lib/lab/store";
import { DEFAULT_POLICY, type Run } from "../lib/lab/types";

const directory = mkdtempSync(join(tmpdir(), "oneground-test-"));
const path = join(directory, "queue.sqlite");
process.env.ONEGROUND_DB_PATH = path;
after(() => {
  db().close();
  unlinkSync(path);
  rmdirSync(directory);
});
test("SQLite preserves snapshots, checkpoints, leases and cancellation across claims", () => {
  const run: Run = {
    id: "run",
    name: "test",
    createdAt: "",
    dataset: {
      id: "d",
      name: "dataset",
      createdAt: "",
      rows: [
        { id: "1", state: "one", expected: {}, split: "test", segment: "" },
        { id: "2", state: "two", expected: {}, split: "test", segment: "" },
      ],
    },
    schema: {
      id: "s",
      name: "schema",
      createdAt: "",
      drafts: [],
      questions: { q: { type: "noul", instructions: "yes?" } },
    },
    evaluators: [
      {
        id: "e",
        name: "rules",
        kind: "rules",
        model: "rules",
        baseUrl: "",
        prompt: "",
        rules: [],
        defaults: { q: false },
        inputPrice: null,
        outputPrice: null,
      },
    ],
    policy: DEFAULT_POLICY,
    status: "queued",
    items: [
      {
        rowId: "1",
        evaluatorId: "e",
        status: "done",
        attempts: 1,
        answers: { q: { value: true, source: "rules" } },
      },
      { rowId: "2", evaluatorId: "e", status: "pending", attempts: 0 },
    ],
  };
  createRun(run);
  run.dataset.rows[0].state = "edited locally";
  assert.equal(getRun("run").dataset.rows[0].state, "one");
  assert.equal(claimRun(), "run");
  assert.equal(getStatus("run"), "running");
  assert.equal(claimRun(), undefined);
  db()
    .prepare("UPDATE jobs SET lease=? WHERE id=?")
    .run(Date.now() - 61_000, "run");
  assert.equal(claimRun(), "run");
  assert.equal(getRun("run").items[0].status, "done");
  setStatus("run", "cancelled");
  assert.equal(claimRun(), undefined);
  assert.ok(
    (
      db().prepare("SELECT lease FROM jobs WHERE id='run'").get() as {
        lease: number;
      }
    ).lease > 0,
  );
  setStatus("run", "queued");
  assert.equal(claimRun(), "run");
  saveItem("run", {
    ...getRun("run").items[1],
    status: "done",
    attempts: 1,
    answers: { q: { value: false, source: "rules" } },
  });
  setStatus("run", "complete");
  assert.equal(claimRun(), undefined);
  assert.equal(listRuns()[0].progress, 2);
  assert.equal(listRuns()[0].total, 2);
});
