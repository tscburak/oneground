import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDataset, mapRows } from "../lib/lab/import";
import { analyze, decision, tune, validateLabels } from "../lib/lab/metrics";
import { evaluate } from "../lib/lab/evaluators";
import {
  DEFAULT_POLICY,
  ABSTAIN,
  type Run,
  type Schema,
  type Evaluator,
} from "../lib/lab/types";

const schema: Schema = {
  id: "s",
  name: "test",
  createdAt: "",
  drafts: [],
  questions: { urgent: { type: "noul", instructions: "urgent?" } },
};
const evaluator: Evaluator = {
  id: "e",
  name: "rules",
  kind: "rules",
  model: "rules",
  baseUrl: "",
  prompt: "",
  rules: [
    {
      question: "urgent",
      path: "",
      operator: "contains",
      value: "urgent",
      output: true,
    },
  ],
  defaults: { urgent: false },
  inputPrice: null,
  outputPrice: null,
};
function fixture(): Run {
  return {
    id: "r",
    name: "r",
    createdAt: "",
    dataset: {
      id: "d",
      name: "d",
      createdAt: "",
      rows: [
        {
          id: "1",
          state: "Urgent",
          expected: { urgent: true },
          split: "validation",
          segment: "",
        },
        {
          id: "2",
          state: "Hi",
          expected: { urgent: false },
          split: "test",
          segment: "",
        },
        {
          id: "3",
          state: "help",
          expected: { urgent: true },
          split: "test",
          segment: "",
        },
        { id: "4", state: "thanks", expected: {}, split: "test", segment: "" },
      ],
    },
    schema,
    evaluators: [evaluator],
    policy: DEFAULT_POLICY,
    status: "complete",
    items: [
      {
        rowId: "1",
        evaluatorId: "e",
        attempts: 1,
        status: "done",
        answers: {
          urgent: { value: true, probability: 0.9, source: "system-one" },
        },
        latencyMs: 10,
      },
      {
        rowId: "2",
        evaluatorId: "e",
        attempts: 1,
        status: "done",
        answers: {
          urgent: { value: false, probability: 0.4, source: "system-one" },
        },
        latencyMs: 30,
      },
      {
        rowId: "3",
        evaluatorId: "e",
        attempts: 1,
        status: "error",
        error: "timeout",
      },
      {
        rowId: "4",
        evaluatorId: "e",
        attempts: 1,
        status: "done",
        answers: {
          urgent: { value: false, probability: 0.1, source: "system-one" },
        },
        latencyMs: 20,
      },
    ],
  };
}
test("CSV preserves quoted commas, embedded newlines and booleans", () => {
  const records = parseDataset(
    'id,state,label\r\n1,"Urgent, please\nhelp",true\r\n2,"Hello ""there""",false',
    "csv",
  );
  const rows = mapRows(records, {
    id: "id",
    state: "state",
    labels: { urgent: "label" },
    split: "",
    segment: "",
  });
  assert.equal(rows[0].state, "Urgent, please\nhelp");
  assert.equal(rows[1].state, 'Hello "there"');
  assert.equal(rows[0].expected.urgent, true);
});
test("Malformed JSONL and duplicate IDs fail explicitly", () => {
  assert.throws(() => parseDataset('{"id":1}\nbroken', "jsonl"), /Row 2/);
  assert.throws(
    () =>
      mapRows(
        [
          { id: "a", state: "x" },
          { id: "a", state: "y" },
        ],
        { id: "id", state: "state", labels: {}, split: "", segment: "" },
      ),
    /duplicate/,
  );
});
test("Unlabeled rows and service failures stay separate from classification accuracy", () => {
  const stats = analyze(fixture(), "e", "urgent", DEFAULT_POLICY);
  assert.equal(stats.accuracy, 1);
  assert.equal(stats.errors, 1);
  assert.equal(stats.labeled, 3);
  assert.equal(stats.coverage, 0.75);
  assert.equal(stats.p95, 30);
  assert.equal(
    stats.distribution.reduce((n, b) => n + b.unlabeled, 0),
    1,
  );
});
test("Thresholds and abstentions recompute decisions without touching raw answers", () => {
  const run = fixture();
  const original = JSON.stringify(run);
  const stats = analyze(run, "e", "urgent", {
    ...DEFAULT_POLICY,
    threshold: 0.3,
  });
  assert.equal(stats.accuracy, 0.5);
  assert.equal(JSON.stringify(run), original);
  const review = analyze(run, "e", "urgent", {
    ...DEFAULT_POLICY,
    reviewMargin: 0.2,
  });
  assert.equal(review.matrix.false[ABSTAIN], 1);
  assert.equal(review.coverage, 0.5);
  assert.equal(review.accuracy, 1);
  assert.ok(review.macroF1! < 1);
});
test("Validation and test data are isolated", () => {
  assert.equal(
    analyze(fixture(), "e", "urgent", DEFAULT_POLICY, "validation").total,
    1,
  );
  assert.equal(
    analyze(fixture(), "e", "urgent", DEFAULT_POLICY, "test").total,
    3,
  );
});
test("Score evaluates numeric error rather than exact-match classification", () => {
  const run = fixture();
  run.schema = {
    ...schema,
    questions: {
      urgent: {
        type: "score",
        instructions: "severity",
        criteria: ["low", "medium", "high"],
      },
    },
  };
  run.dataset.rows = [{ ...run.dataset.rows[0], expected: { urgent: 2 } }];
  run.items = [
    {
      ...run.items[0],
      answers: {
        urgent: { value: 1.5, source: "system-one", confidence: 0.8 },
      },
    },
  ];
  assert.equal(analyze(run, "e", "urgent", DEFAULT_POLICY).mae, 0.5);
  assert.equal(analyze(run, "e", "urgent", DEFAULT_POLICY).accuracy, null);
  assert.equal(
    analyze(run, "e", "urgent", { ...DEFAULT_POLICY, scoreBoundary: 1 })
      .accuracy,
    1,
  );
});
test("Rules use first match and provide trace without fabricated confidence", async () => {
  const result = await evaluate(evaluator, "Urgent help", schema);
  assert.equal(result.answers.urgent.value, true);
  assert.equal(result.answers.urgent.confidence, undefined);
  assert.match(result.answers.urgent.trace!, /contains/);
  assert.equal(
    decision(result.answers.urgent, schema.questions.urgent, {
      ...DEFAULT_POLICY,
      confidence: 0.95,
    }),
    "true",
  );
});
test("Labels must match the actual question schema", () => {
  const rows = fixture().dataset.rows;
  rows[0].expected.urgent = "yes";
  assert.throws(() => validateLabels(rows, schema.questions), /true\/false/);
});

test("A real review class is distinct from a withheld prediction", () => {
  const run = fixture();
  run.schema = {
    ...schema,
    questions: {
      urgent: {
        type: "choice",
        instructions: "action",
        criteria: { review: "human review", pass: "allow" },
      },
    },
  };
  run.dataset.rows = [
    { ...run.dataset.rows[0], expected: { urgent: "review" } },
  ];
  run.items = [
    {
      ...run.items[0],
      answers: {
        urgent: {
          value: "review",
          confidence: 0.8,
          source: "system-one",
          probabilities: { review: 0.9, pass: 0.1 },
        },
      },
    },
  ];
  const normal = analyze(run, "e", "urgent", DEFAULT_POLICY);
  assert.equal(normal.coverage, 1);
  assert.equal(normal.accuracy, 1);
  assert.equal(normal.perClass[0].label, "review");
  const withheld = analyze(run, "e", "urgent", {
    ...DEFAULT_POLICY,
    confidence: 0.9,
  });
  assert.equal(withheld.coverage, 0);
  assert.equal(withheld.matrix.review[ABSTAIN], 1);
});
test("Tuning uses validation answers and ignores test labels", () => {
  const run = fixture();
  const options = {
    goal: "f1" as const,
    minimumRecall: 0.9,
    falsePositiveCost: 1,
    falseNegativeCost: 5,
    reviewCost: 0.5,
    segment: "",
  };
  const first = tune(run, "e", "urgent", DEFAULT_POLICY, options);
  assert.ok(
    Math.abs(analyze(run, "e", "urgent", DEFAULT_POLICY).brier! - 0.085) <
      1e-10,
  );
  run.dataset.rows
    .filter((row) => row.split === "test")
    .forEach((row) => {
      row.expected.urgent = true;
    });
  assert.deepEqual(tune(run, "e", "urgent", DEFAULT_POLICY, options), first);
});
