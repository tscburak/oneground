"use client";
import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { analyze, tune } from "@/lib/lab/metrics";
import type { Policy, Run } from "@/lib/lab/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdvancedAnalysis({
  run,
  question,
  evaluator,
  policy,
  split,
  segment,
  onPolicy,
  tr,
}: {
  run: Run;
  question: string;
  evaluator: string;
  policy: Policy;
  split: string;
  segment: string;
  onPolicy: (policy: Policy) => void;
  tr: boolean;
}) {
  const t = (a: string, b: string) => (tr ? a : b);
  const [goal, setGoal] = useState<"f1" | "recall" | "cost">("f1"),
    [minimumRecall, setMinimumRecall] = useState(0.9),
    [fp, setFp] = useState(1),
    [fn, setFn] = useState(5),
    [review, setReview] = useState(0.5),
    [error, setError] = useState("");
  const [parent, setParent] = useState<Run | null>(null);
  useEffect(() => {
    let alive = true;
    if (run.parentId)
      void fetch(`/api/lab?run=${encodeURIComponent(run.parentId)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("Parent run unavailable.");
          const value = await res.json();
          if (alive) setParent(value);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    return () => {
      alive = false;
    };
  }, [run.parentId]);
  const stats = analyze(run, evaluator, question, policy, split, segment);
  const first = run.evaluators[0],
    second = run.evaluators[1];
  const a = first
    ? analyze(run, first.id, question, policy, split, segment)
    : null;
  const b = second
    ? analyze(run, second.id, question, policy, split, segment)
    : null;
  const bSamples = new Map(b?.samples.map((sample) => [sample.row.id, sample]));
  const currentRowIds = new Set(run.dataset.rows.map((row) => row.id));
  const paired =
    a && b
      ? a.samples.flatMap((s) => {
          const other = bSamples.get(s.row.id);
          return s.truth !== undefined &&
            s.prediction !== undefined &&
            other?.prediction !== undefined
            ? [{ a: s.correct, b: other.correct }]
            : [];
        })
      : [];
  const originalEvaluator =
    parent?.evaluators.find((e) => e.id === evaluator) ??
    parent?.evaluators.find(
      (e) => e.name === run.evaluators.find((v) => v.id === evaluator)?.name,
    );
  const original =
    parent &&
    parent.id === run.parentId &&
    parent.schema.questions[question] &&
    originalEvaluator
      ? analyze(
          {
            ...parent,
            dataset: {
              ...parent.dataset,
              rows: parent.dataset.rows.filter((row) =>
                currentRowIds.has(row.id),
              ),
            },
          },
          originalEvaluator.id,
          question,
          parent.policy,
          split,
          segment,
        )
      : null;
  const delta = (current: number | null, previous: number | null) =>
    current === null || previous === null
      ? "—"
      : `${current - previous >= 0 ? "+" : ""}${((current - previous) * 100).toFixed(1)} pp`;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            {t("Hedefe göre eşik seçimi", "Objective-based tuning")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "Yalnızca validation kayıtları kullanılır. Noul: karar eşiği; Choice: confidence eşiği. Maliyet hedefi Noul içindir.",
              "Uses validation rows only. Noul: decision threshold; Choice: confidence threshold. Cost objective is for Noul.",
            )}
          </p>
          <label className="grid gap-1 text-sm">
            {t("Hedef", "Objective")}
            <select
              className="h-9 rounded border bg-background px-2"
              value={goal}
              onChange={(e) => setGoal(e.target.value as typeof goal)}
            >
              <option value="f1">Macro F1</option>
              <option value="recall">Minimum recall → precision</option>
              <option value="cost">Minimum error cost</option>
            </select>
          </label>
          {goal === "recall" && (
            <label className="grid gap-1 text-sm">
              Minimum recall
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={minimumRecall}
                onChange={(e) => setMinimumRecall(Number(e.target.value))}
              />
            </label>
          )}
          {goal === "cost" && (
            <div className="grid grid-cols-3 gap-2">
              {[
                ["FP cost", fp, setFp],
                ["FN cost", fn, setFn],
                ["Review cost", review, setReview],
              ].map(([label, value, setter]) => (
                <label key={String(label)} className="grid gap-1 text-xs">
                  {String(label)}
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={value as number}
                    onChange={(e) =>
                      (setter as (v: number) => void)(Number(e.target.value))
                    }
                  />
                </label>
              ))}
            </div>
          )}
          <Button
            disabled={
              run.schema.questions[question].type === "score" ||
              !stats.samples.some((s) =>
                run.schema.questions[question].type === "noul"
                  ? s.answer?.probability !== undefined
                  : s.answer?.confidence !== undefined,
              ) ||
              (run.schema.questions[question].type !== "noul" && goal !== "f1")
            }
            onClick={() => {
              try {
                if (
                  minimumRecall < 0 ||
                  minimumRecall > 1 ||
                  Math.min(fp, fn, review) < 0
                )
                  throw new Error("Invalid tuning constraints.");
                setError("");
                onPolicy(
                  tune(run, evaluator, question, policy, {
                    goal,
                    minimumRecall,
                    falsePositiveCost: fp,
                    falseNegativeCost: fn,
                    reviewCost: review,
                    segment,
                  }),
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            {t(
              "Validation’da seç ve testte göster",
              "Select on validation & show test",
            )}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {!!paired.length && (
            <div className="rounded bg-muted p-3 text-sm">
              <p className="font-medium">
                {first.name} vs {second.name} · {paired.length} paired
              </p>
              <p>
                A ✓ / B ✗: {paired.filter((p) => p.a && !p.b).length} · A ✗ / B
                ✓: {paired.filter((p) => !p.a && p.b).length}
              </p>
              <p>
                {t("İkisi doğru", "Both correct")}:{" "}
                {paired.filter((p) => p.a && p.b).length} ·{" "}
                {t("İkisi yanlış", "Both wrong")}:{" "}
                {paired.filter((p) => !p.a && !p.b).length}
              </p>
            </div>
          )}
          {original && (
            <div className="rounded bg-muted p-3 text-sm">
              <p className="font-medium">
                Replay Δ ·{" "}
                {t(
                  "aynı kayıtlar, kaynak politikası → güncel politika",
                  "same rows, parent policy → current policy",
                )}
              </p>
              <p>
                Accuracy: {delta(stats.accuracy, original.accuracy)} · F1:{" "}
                {delta(stats.macroF1, original.macroF1)} · Coverage:{" "}
                {delta(stats.coverage, original.coverage)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {t("Olasılık kalibrasyonu", "Probability calibration")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "Confidence yerine model olasılıkları kullanılır. Noul: P(evet) / gözlenen evet oranı. Choice: seçilen sınıf olasılığı / doğruluk oranı.",
              "Uses probabilities rather than confidence. Noul: P(yes) / observed yes rate. Choice: selected class probability / accuracy.",
            )}
          </p>
          <p className="text-sm">
            {run.schema.questions[question].type === "noul"
              ? "Brier score"
              : "Top-label squared error"}
            : {stats.brier?.toFixed(4) ?? "—"}
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.calibration.filter((b) => b.count)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" fontSize={10} />
                <YAxis domain={[0, 1]} />
                <Tooltip />
                <Legend />
                <Line dataKey="probability" stroke="#6366f1" />
                <Line dataKey="observed" stroke="#10b981" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {stats.calibration
              .filter((b) => b.count)
              .map((b) => (
                <span key={b.range}>
                  {b.range}: n={b.count}
                </span>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
