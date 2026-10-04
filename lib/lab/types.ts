import type { QuestionDraft, QuestionsMap } from "../typesafe";

export type Label = string | number | boolean;
export const ABSTAIN = "⟂ review";
export type DatasetRow = {
  id: string;
  state: string | object;
  expected: Record<string, Label>;
  split: "validation" | "test";
  segment: string;
};
export type Dataset = {
  id: string;
  name: string;
  createdAt: string;
  rows: DatasetRow[];
};
export type Schema = {
  id: string;
  name: string;
  createdAt: string;
  drafts: QuestionDraft[];
  questions: QuestionsMap;
};
export type Policy = {
  threshold: number;
  confidence: number;
  reviewMargin: number;
  scoreBoundary: number | null;
};
export type Rule = {
  question: string;
  path: string;
  operator: "contains" | "equals" | "gt" | "regex";
  value: string;
  output: Label;
};
export type Evaluator = {
  profileId?: string;
  id: string;
  name: string;
  kind: "rules" | "system-one" | "llm" | "cascade";
  model: string;
  baseUrl: string;
  prompt: string;
  rules: Rule[];
  defaults: Record<string, Label>;
  inputPrice: number | null;
  outputPrice: number | null;
  stages?: string[];
  fallbackConfidence?: number;
};
export type Judgment = {
  value: Label;
  probability?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  source: "rules" | "system-one" | "llm";
  trace?: string;
};
export type RunItem = {
  rowId: string;
  evaluatorId: string;
  status: "pending" | "running" | "done" | "error";
  attempts: number;
  answers?: Record<string, Judgment>;
  raw?: unknown;
  error?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  resolvedModel?: string;
  startedAt?: string;
  completedAt?: string;
};
export type Run = {
  id: string;
  name: string;
  createdAt: string;
  dataset: Dataset;
  schema: Schema;
  evaluators: Evaluator[];
  policy: Policy;
  items: RunItem[];
  status: "queued" | "running" | "complete" | "cancelled";
  parentId?: string;
  replay?: "policy" | "inference";
};
export const DEFAULT_POLICY: Policy = {
  threshold: 0.5,
  confidence: 0,
  reviewMargin: 0,
  scoreBoundary: null,
};
export type RunSummary = Omit<Run, "items" | "dataset"> & {
  dataset: Pick<Dataset, "id" | "name">;
  progress: number;
  total: number;
};
