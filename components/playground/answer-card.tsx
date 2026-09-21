"use client";

import {
  Bar,
  BarChart,
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  Answer,
  ChoiceAnswer,
  NoulAnswer,
  ScoreAnswer,
} from "@/lib/typesafe";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function ConfidenceMeter({ value }: { value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Confidence</span>
        <span className="font-mono text-foreground">{pct(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-all"
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; payload?: { label: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md">
      <span className="font-mono">{item.payload?.label}</span>
      <span className="ml-2 font-semibold">{pct(Number(item.value ?? 0))}</span>
    </div>
  );
}

function NoulCard({ id, answer }: { id: string; answer: NoulAnswer }) {
  const value = answer.noul;
  const interpretation =
    value >= 0.75 ? "Strong yes" : value <= 0.25 ? "Strong no" : "Uncertain (near 0.5)";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline">noul</Badge>
          <CardTitle className="font-mono text-base">{id}</CardTitle>
        </div>
        <CardDescription>Probability the answer is yes. Noul has no separate confidence.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="relative h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={[{ name: "yes", value }]}
                innerRadius="66%"
                outerRadius="100%"
                startAngle={210}
                endAngle={-30}
              >
                <PolarAngleAxis type="number" domain={[0, 1]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "var(--muted)" }} fill="var(--chart-2)" />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-bold tabular-nums">{value.toFixed(3)}</span>
              <span className="text-xs text-muted-foreground">P(yes)</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0 — no</span>
                <span>0.5</span>
                <span>1 — yes</span>
              </div>
              <div className="relative h-1.5 w-64 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${value * 100}%` }}
                />
              </div>
            </div>
            <Badge variant="secondary">{interpretation}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChoiceCard({ id, answer }: { id: string; answer: ChoiceAnswer }) {
  const data = Object.entries(answer.probabilities).map(([name, probability]) => ({
    name,
    label: name,
    probability,
    chosen: name === answer.choice,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline">choice</Badge>
          <CardTitle className="font-mono text-base">{id}</CardTitle>
        </div>
        <CardDescription>
          Selected: <span className="font-mono font-semibold text-foreground">{answer.choice}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
              <XAxis type="number" domain={[0, 1]} hide />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="probability" radius={4} barSize={12} label={{ position: "right", formatter: (v) => pct(Number(v)), className: "fill-muted-foreground text-xs" }}>
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.chosen ? "var(--chart-2)" : "var(--chart-1)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ConfidenceMeter value={answer.confidence} />
      </CardContent>
    </Card>
  );
}

function ScoreCard({ id, answer }: { id: string; answer: ScoreAnswer }) {
  const levels = Object.keys(answer.probabilities)
    .map(Number)
    .sort((a, b) => a - b);
  const maxLevel = levels.length > 1 ? levels[levels.length - 1] : 1;

  const data = levels.map((level) => ({
    name: String(level),
    label: answer.legend[String(level)] ?? `Level ${level}`,
    probability: answer.probabilities[String(level)] ?? 0,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline">score</Badge>
          <CardTitle className="font-mono text-base">{id}</CardTitle>
        </div>
        <CardDescription>
          Scored{" "}
          <span className="font-mono font-semibold text-foreground">{answer.score.toFixed(2)}</span>{" "}
          on a 0–{maxLevel} scale (can land between levels).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -16 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: string) => {
                  const legend = answer.legend[v];
                  return legend && legend.length > 18 ? `${legend.slice(0, 16)}…` : (legend ?? v);
                }}
                interval={0}
              />
              <YAxis hide domain={[0, 1]} />
              <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="probability" radius={6}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill="var(--chart-1)" />
                ))}
              </Bar>
              <ReferenceLine
                x={String(levels.reduce((closest, level) =>
                  Math.abs(level - answer.score) < Math.abs(closest - answer.score) ? level : closest, levels[0]))}
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mb-4 grid gap-1 text-xs text-muted-foreground">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-right font-mono">{entry.name}</span>
              <span className="truncate">{entry.label}</span>
            </div>
          ))}
        </div>
        <ConfidenceMeter value={answer.confidence} />
      </CardContent>
    </Card>
  );
}

export function AnswerCard({ id, answer, className }: { id: string; answer: Answer; className?: string }) {
  const card =
    answer.type === "noul" ? (
      <NoulCard id={id} answer={answer} />
    ) : answer.type === "choice" ? (
      <ChoiceCard id={id} answer={answer} />
    ) : (
      <ScoreCard id={id} answer={answer} />
    );
  return <div className={cn(className)}>{card}</div>;
}
