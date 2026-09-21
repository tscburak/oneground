export type JsonStructure = string | object | unknown[];

export type NoulQuestionPayload = {
  type: "noul";
  instructions: JsonStructure;
  criteria?: { true?: JsonStructure; false?: JsonStructure };
};

export type ChoiceQuestionPayload = {
  type: "choice";
  instructions: JsonStructure;
  criteria: Record<string, JsonStructure | null>;
};

export type ScoreQuestionPayload = {
  type: "score";
  instructions: JsonStructure;
  criteria: JsonStructure[];
};

export type QuestionPayload =
  | NoulQuestionPayload
  | ChoiceQuestionPayload
  | ScoreQuestionPayload;

export type QuestionsMap = Record<string, QuestionPayload>;

export type NoulAnswer = {
  type: "noul";
  noul: number;
};

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
};

export type SystemOneResponse = {
  model: string;
  answers: Record<string, Answer>;
  usage?: Usage;
};

export type EvaluateResponse = SystemOneResponse & {
  latencyMs?: number;
  provider?: Provider;
};

export type Provider = "hosted" | "local";

export const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  hosted: "jev-latest",
  local: "kev-latest",
};

export const PROVIDER_MODELS: Record<Provider, string[]> = {
  hosted: ["jev-latest", "jev-preview", "jev-1.13.0"],
  local: ["kev-latest"],
};

export type QuestionDraft =
  | {
      id: string;
      kind: "noul";
      instructions: string;
      trueCriteria: string;
      falseCriteria: string;
    }
  | {
      id: string;
      kind: "choice";
      instructions: string;
      options: { key: string; description: string }[];
    }
  | {
      id: string;
      kind: "score";
      instructions: string;
      levels: string[];
    };

export type StateDraft = {
  text: string;
};

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "q"
  );
}

export function nextQuestionId(drafts: QuestionDraft[]): string {
  const used = new Set(drafts.map((d) => d.id));
  let n = drafts.length + 1;
  let id = `q${n}`;
  while (used.has(id)) {
    n += 1;
    id = `q${n}`;
  }
  return id;
}

export function nextKey(existing: { key: string }[], base: string): string {
  const used = new Set(existing.map((o) => o.key));
  const root = slugify(base) || "option";
  if (!used.has(root)) return root;
  let n = 2;
  while (used.has(`${root}_${n}`)) n += 1;
  return `${root}_${n}`;
}

export function draftToPayload(draft: QuestionDraft): QuestionPayload {
  if (draft.kind === "noul") {
    const payload: NoulQuestionPayload = {
      type: "noul",
      instructions: draft.instructions.trim(),
    };
    if (draft.trueCriteria.trim() || draft.falseCriteria.trim()) {
      payload.criteria = {};
      if (draft.trueCriteria.trim()) payload.criteria.true = draft.trueCriteria.trim();
      if (draft.falseCriteria.trim()) payload.criteria.false = draft.falseCriteria.trim();
    }
    return payload;
  }
  if (draft.kind === "choice") {
    const criteria: Record<string, JsonStructure | null> = {};
    for (const option of draft.options) {
      criteria[option.key] = option.description.trim() || null;
    }
    return {
      type: "choice",
      instructions: draft.instructions.trim(),
      criteria,
    };
  }
  return {
    type: "score",
    instructions: draft.instructions.trim(),
    criteria: draft.levels.map((level) => level.trim()),
  };
}

export function buildQuestions(drafts: QuestionDraft[]): QuestionsMap {
  const questions: QuestionsMap = {};
  for (const draft of drafts) {
    questions[draft.id] = draftToPayload(draft);
  }
  return questions;
}

export function parseState(text: string): JsonStructure | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as JsonStructure;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function validateDrafts(drafts: QuestionDraft[]): string | null {
  if (drafts.length === 0) return "Add at least one question.";
  const ids = new Set<string>();
  for (const draft of drafts) {
    if (!draft.id.trim()) return "Every question needs an id.";
    if (ids.has(draft.id)) return `Duplicate question id: ${draft.id}`;
    ids.add(draft.id);
    if (!draft.instructions.trim()) return `Question "${draft.id}" needs instructions.`;
    if (draft.kind === "choice") {
      if (draft.options.length < 2) return `Choice "${draft.id}" needs at least two options.`;
      const keys = new Set<string>();
      for (const option of draft.options) {
        if (!option.key.trim()) return `Choice "${draft.id}" has an empty option key.`;
        if (keys.has(option.key)) return `Choice "${draft.id}" has duplicate option "${option.key}".`;
        keys.add(option.key);
      }
    }
    if (draft.kind === "score") {
      if (draft.levels.length < 2) return `Score "${draft.id}" needs at least two levels.`;
      if (draft.levels.length > 10) return `Score "${draft.id}" allows at most ten levels.`;
      if (draft.levels.some((level) => !level.trim())) return `Score "${draft.id}" has an empty level.`;
    }
  }
  return null;
}
