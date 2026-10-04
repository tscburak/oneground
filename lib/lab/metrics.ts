import type { DatasetRow, Judgment, Policy, Run } from "./types";
import { ABSTAIN } from "./types";
import type { QuestionPayload } from "../typesafe";

export function decision(
  answer: Judgment,
  question: QuestionPayload,
  policy: Policy,
): string {
  if (answer.confidence !== undefined && answer.confidence < policy.confidence)
    return ABSTAIN;
  if (question.type === "noul" && answer.probability !== undefined) {
    if (
      policy.reviewMargin > 0 &&
      Math.abs(answer.probability - policy.threshold) < policy.reviewMargin
    )
      return ABSTAIN;
    return String(answer.probability >= policy.threshold);
  }
  if (question.type === "score" && policy.scoreBoundary !== null)
    return String(Number(answer.value) >= policy.scoreBoundary);
  return String(answer.value);
}

export function analyze(
  run: Run,
  evaluatorId: string,
  questionId: string,
  policy: Policy,
  split = "all",
  segment = "",
) {
  const question = run.schema.questions[questionId];
  const rows = run.dataset.rows.filter(
    (row) =>
      (split === "all" || row.split === split) &&
      (!segment || row.segment === segment),
  );
  const items = new Map(
    run.items
      .filter((item) => item.evaluatorId === evaluatorId)
      .map((item) => [item.rowId, item]),
  );
  const samples = rows.map((row) => {
    const item = items.get(row.id),
      answer = item?.answers?.[questionId];
    const expected = row.expected[questionId];
    const truth =
      expected === undefined
        ? undefined
        : question.type === "score"
          ? policy.scoreBoundary === null
            ? String(Number(expected))
            : String(Number(expected) >= policy.scoreBoundary)
          : String(expected);
    const prediction = answer ? decision(answer, question, policy) : undefined;
    return {
      row,
      item,
      answer,
      truth,
      prediction,
      correct:
        truth !== undefined && prediction !== undefined
          ? truth === prediction
          : undefined,
    };
  });
  const labeled = samples.filter((s) => s.truth !== undefined);
  const answered = samples.filter((s) => s.answer);
  const automatic = answered.filter((s) => s.prediction !== ABSTAIN);
  const evaluated = labeled.filter((s) => s.answer);
  const accepted = evaluated.filter((s) => s.prediction !== ABSTAIN);
  const numericScore =
    question.type === "score" && policy.scoreBoundary === null;
  const labels = numericScore
    ? []
    : [...new Set(evaluated.flatMap((s) => [s.truth!, s.prediction!]))].sort();
  const matrix = Object.fromEntries(
    labels.map((truth) => [
      truth,
      Object.fromEntries(labels.map((pred) => [pred, 0])),
    ]),
  );
  if (!numericScore)
    for (const sample of evaluated)
      matrix[sample.truth!][sample.prediction!] += 1;
  const perClass = labels
    .filter((label) => label !== ABSTAIN)
    .map((label) => {
      const tp = evaluated.filter(
        (s) => s.truth === label && s.prediction === label,
      ).length;
      const fp = evaluated.filter(
        (s) => s.truth !== label && s.prediction === label,
      ).length;
      const fn = evaluated.filter(
        (s) => s.truth === label && s.prediction !== label,
      ).length;
      const precision = tp + fp ? tp / (tp + fp) : 0,
        recall = tp + fn ? tp / (tp + fn) : 0;
      return {
        label,
        precision,
        recall,
        f1:
          precision + recall
            ? (2 * precision * recall) / (precision + recall)
            : 0,
        support: tp + fn,
      };
    });
  const latencies = answered
    .map((s) => s.item?.latencyMs ?? 0)
    .sort((a, b) => a - b);
  const quantile = (p: number) =>
    latencies.length
      ? latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)]
      : null;
  const distribution = Array.from({ length: 10 }, (_, i) => {
    const bucket = answered.filter((s) => {
      const value =
        question.type === "noul" ? s.answer?.probability : s.answer?.confidence;
      return value !== undefined && Math.min(9, Math.floor(value * 10)) === i;
    });
    return {
      range: `${i * 10}–${(i + 1) * 10}%`,
      correct: bucket.filter((s) => s.correct === true).length,
      wrong: bucket.filter((s) => s.correct === false).length,
      unlabeled: bucket.filter((s) => s.correct === undefined).length,
    };
  });
  const calibrationSamples = evaluated.flatMap((s) => {
    if (s.answer?.probability !== undefined && question.type === "noul")
      return [
        {
          probability: s.answer.probability,
          outcome: s.truth === "true" ? 1 : 0,
        },
      ];
    if (question.type === "choice" && s.answer?.probabilities)
      return [
        {
          probability: s.answer.probabilities[String(s.answer.value)] ?? 0,
          outcome: String(s.answer.value) === s.truth ? 1 : 0,
        },
      ];
    return [];
  });
  const calibration = Array.from({ length: 10 }, (_, i) => {
    const bucket = calibrationSamples.filter(
      (s) => Math.min(9, Math.floor(s.probability * 10)) === i,
    );
    return {
      range: `${i * 10}–${(i + 1) * 10}%`,
      count: bucket.length,
      probability: bucket.length
        ? bucket.reduce((n, s) => n + s.probability, 0) / bucket.length
        : null,
      observed: bucket.length
        ? bucket.reduce((n, s) => n + s.outcome, 0) / bucket.length
        : null,
    };
  });
  const brier = calibrationSamples.length
    ? calibrationSamples.reduce(
        (n, s) => n + (s.probability - s.outcome) ** 2,
        0,
      ) / calibrationSamples.length
    : null;
  const evaluator = run.evaluators.find((e) => e.id === evaluatorId)!;
  const settled = samples.filter(
    (s) => s.item?.status === "done" || s.item?.status === "error",
  );
  const timed = settled.filter((s) => s.item?.startedAt && s.item?.completedAt);
  const elapsed = timed.length
    ? Math.max(...timed.map((s) => Date.parse(s.item!.completedAt!))) -
      Math.min(...timed.map((s) => Date.parse(s.item!.startedAt!)))
    : 0;
  const throughput = elapsed > 0 ? timed.length / (elapsed / 1000) : null;
  const fallbackRate =
    evaluator.kind === "cascade" && answered.length
      ? answered.filter(
          (s) =>
            s.item?.raw &&
            typeof s.item.raw === "object" &&
            "fallback" in s.item.raw &&
            s.item.raw.fallback === true,
        ).length / answered.length
      : null;
  const usageKnown =
    settled.length > 0 &&
    settled.every(
      (s) =>
        typeof s.item?.inputTokens === "number" &&
        typeof s.item.outputTokens === "number",
    );
  const inputTokens = settled.reduce(
      (sum, s) => sum + (s.item?.inputTokens ?? 0),
      0,
    ),
    outputTokens = settled.reduce(
      (sum, s) => sum + (s.item?.outputTokens ?? 0),
      0,
    );
  return {
    samples,
    labels,
    matrix,
    perClass,
    distribution,
    calibration,
    brier,
    throughput,
    fallbackRate,
    total: rows.length,
    labeled: labeled.length,
    answered: answered.length,
    errors: samples.filter((s) => s.item?.status === "error").length,
    pending: samples.filter(
      (s) => s.item?.status === "pending" || s.item?.status === "running",
    ).length,
    coverage: rows.length ? automatic.length / rows.length : 0,
    accuracy:
      !numericScore && accepted.length
        ? accepted.filter((s) => s.correct).length / accepted.length
        : null,
    macroF1:
      !numericScore && evaluated.length && perClass.length
        ? perClass.reduce((sum, c) => sum + c.f1, 0) / perClass.length
        : null,
    mae:
      numericScore && evaluated.length
        ? evaluated.reduce(
            (sum, s) =>
              sum +
              Math.abs(
                Number(s.answer!.value) - Number(s.row.expected[questionId]),
              ),
            0,
          ) / evaluated.length
        : null,
    p50: quantile(0.5),
    p95: quantile(0.95),
    inputTokens,
    outputTokens,
    cost:
      evaluator.kind === "rules"
        ? 0
        : usageKnown &&
            evaluator.inputPrice !== null &&
            evaluator.outputPrice !== null
          ? (inputTokens * evaluator.inputPrice +
              outputTokens * evaluator.outputPrice) /
            1_000_000
          : null,
  };
}

export function validateLabels(
  rows: DatasetRow[],
  questions: Run["schema"]["questions"],
) {
  for (const row of rows)
    for (const [id, label] of Object.entries(row.expected)) {
      const q = questions[id];
      if (!q) throw new Error(`Row ${row.id}: unknown question ${id}.`);
      if (
        q.type === "noul" &&
        label !== true &&
        label !== false &&
        label !== "true" &&
        label !== "false"
      )
        throw new Error(`Row ${row.id}: ${id} requires true/false.`);
      if (q.type === "choice" && !Object.hasOwn(q.criteria, String(label)))
        throw new Error(`Row ${row.id}: unknown choice ${label}.`);
      if (
        q.type === "score" &&
        (!Number.isFinite(Number(label)) ||
          Number(label) < 0 ||
          Number(label) > q.criteria.length - 1)
      )
        throw new Error(`Row ${row.id}: invalid score label.`);
    }
}

export function tune(
  run: Run,
  evaluatorId: string,
  questionId: string,
  policy: Policy,
  options: {
    goal: "f1" | "recall" | "cost";
    minimumRecall: number;
    falsePositiveCost: number;
    falseNegativeCost: number;
    reviewCost: number;
    segment: string;
  },
) {
  const question = run.schema.questions[questionId];
  const baseline = analyze(
    run,
    evaluatorId,
    questionId,
    policy,
    "validation",
    options.segment,
  );
  if (!baseline.samples.some((s) => s.truth !== undefined && s.answer))
    throw new Error("Labeled validation answers are required.");
  if (
    !baseline.samples.some(
      (s) =>
        s.truth !== undefined &&
        (question.type === "noul"
          ? s.answer?.probability !== undefined
          : s.answer?.confidence !== undefined),
    )
  )
    throw new Error(
      "This evaluator has no tunable probability/confidence on labeled validation rows.",
    );
  if (question.type === "score")
    throw new Error("Automatic tuning supports Noul and Choice.");
  const candidates = Array.from({ length: 101 }, (_, i) => {
    const candidate = {
      ...policy,
      [question.type === "noul" ? "threshold" : "confidence"]: i / 100,
    };
    const stats = analyze(
      run,
      evaluatorId,
      questionId,
      candidate,
      "validation",
      options.segment,
    );
    const positive = stats.perClass.find((c) => c.label === "true");
    const cost = stats.samples.reduce((n, s) => {
      if (s.truth === undefined || !s.answer) return n;
      if (s.prediction === ABSTAIN) return n + options.reviewCost;
      if (s.prediction === s.truth) return n;
      return (
        n +
        (s.prediction === "true"
          ? options.falsePositiveCost
          : options.falseNegativeCost)
      );
    }, 0);
    const eligible =
      options.goal !== "recall" ||
      (positive?.recall ?? 0) >= options.minimumRecall;
    return {
      policy: candidate,
      score:
        options.goal === "cost"
          ? -cost
          : options.goal === "recall"
            ? (positive?.precision ?? 0)
            : (stats.macroF1 ?? 0),
      eligible,
    };
  })
    .filter((c) => c.eligible)
    .sort((a, b) => b.score - a.score);
  if (!candidates.length)
    throw new Error("No threshold satisfies the minimum recall.");
  return candidates[0].policy;
}
