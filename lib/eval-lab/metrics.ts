import type { Answer } from "@/lib/typesafe";

export type EvalRowResult = {
  rowId: string;
  statePreview: string;
  expected: Record<string, string | number | boolean>;
  predicted: Record<string, string | number | boolean | null>;
  correct: Record<string, boolean | null>;
  error: string | null;
  latencyMs?: number;
};

function answerScalar(answer: Answer | undefined): string | number | boolean | null {
  if (!answer) return null;
  if (answer.type === "noul") return answer.noul >= 0.5;
  if (answer.type === "choice") return answer.choice;
  return answer.score;
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    const left = a === true || a === "true" ? true : a === false || a === "false" ? false : a;
    const right = b === true || b === "true" ? true : b === false || b === "false" ? false : b;
    return left === right;
  }
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function scoreRow(
  rowId: string,
  statePreview: string,
  expected: Record<string, string | number | boolean>,
  answers: Record<string, Answer> | null,
  questionIds: string[],
  error: string | null,
  latencyMs?: number,
): EvalRowResult {
  const predicted: Record<string, string | number | boolean | null> = {};
  const correct: Record<string, boolean | null> = {};
  for (const id of questionIds) {
    const value = answers ? answerScalar(answers[id]) : null;
    predicted[id] = value;
    const truth = expected[id];
    if (value === null || truth === undefined) correct[id] = null;
    else correct[id] = same(value, truth);
  }
  return { rowId, statePreview, expected, predicted, correct, error, latencyMs };
}

export type ModelAccuracy = {
  profileId: string;
  label: string;
  total: number;
  labeled: number;
  correct: number;
  accuracy: number | null;
  errors: number;
  avgLatencyMs: number | null;
  perQuestion: Record<string, { correct: number; labeled: number; accuracy: number | null }>;
};

export function summarizeModel(
  profileId: string,
  label: string,
  rows: EvalRowResult[],
  questionIds: string[],
  latencies: number[],
): ModelAccuracy {
  let correct = 0;
  let labeled = 0;
  let errors = 0;
  const perQuestion: ModelAccuracy["perQuestion"] = {};
  for (const id of questionIds) perQuestion[id] = { correct: 0, labeled: 0, accuracy: null };
  for (const row of rows) {
    if (row.error) errors += 1;
    for (const id of questionIds) {
      const result = row.correct[id];
      if (result === null || result === undefined) continue;
      labeled += 1;
      perQuestion[id].labeled += 1;
      if (result) {
        correct += 1;
        perQuestion[id].correct += 1;
      }
    }
  }
  for (const id of questionIds) {
    const entry = perQuestion[id];
    entry.accuracy = entry.labeled ? entry.correct / entry.labeled : null;
  }
  const answered = latencies.filter((value) => Number.isFinite(value));
  return {
    profileId,
    label,
    total: rows.length,
    labeled,
    correct,
    accuracy: labeled ? correct / labeled : null,
    errors,
    avgLatencyMs: answered.length
      ? Math.round(answered.reduce((a, b) => a + b, 0) / answered.length)
      : null,
    perQuestion,
  };
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}
