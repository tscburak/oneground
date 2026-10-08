"use client";

import { format, useI18n } from "@/components/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  Answer,
  EvaluateResponse,
  JsonStructure,
  QuestionsMap,
} from "@/lib/typesafe";
import { previewState } from "@/lib/typesafe";
import { AnswerCell } from "./answer-cell";
import {
  AnswerDetailButton,
  type AnswerDetailEntry,
  type AnswerDetailMeta,
} from "./answer-detail-dialog";

export type ComparisonResult = {
  profileId: string;
  name: string;
  request: { state: JsonStructure; model: string; questions: QuestionsMap };
  response: EvaluateResponse | null;
  error: string | null;
};

export type ResultRow = {
  key: string;
  state?: JsonStructure;
  stateSpan?: number;
  model: string;
  status: "done" | "error" | "running" | "pending";
  error: string | null;
  meta: AnswerDetailMeta;
  answers: Record<string, Answer>;
};

export type ModelSummary = {
  key: string;
  label: string;
  done: number;
  total: number;
  failed?: number;
  avgLatencyMs?: number;
  tokens?: number;
};

export function ResultsTable({
  title,
  rows,
  answerOrder,
  showState,
  summary,
  running,
}: {
  title?: string;
  rows: ResultRow[];
  answerOrder: string[];
  showState: boolean;
  summary?: ModelSummary[];
  running?: boolean;
}) {
  const dict = useI18n();

  function statusLabel(row: ResultRow): string {
    if (row.status === "done") return dict.compare.done;
    if (row.status === "error") return dict.bulk.rowFailed;
    if (row.status === "running") return dict.bulk.rowRunning;
    return dict.bulk.rowPending;
  }

  const table = (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {showState && (
              <th className="px-3 py-2 text-left font-medium">
                {dict.bulk.stateColumn}
              </th>
            )}
            <th className="px-3 py-2 text-left font-medium">
              {dict.model.label}
            </th>
            {answerOrder.map((id) => (
              <th
                key={id}
                className="px-3 py-2 text-left font-mono text-xs font-medium"
              >
                {id}
              </th>
            ))}
            <th className="px-3 py-2 text-left font-medium">
              {dict.bulk.latencyColumn}
            </th>
            <th className="px-3 py-2 text-left font-medium">
              {dict.compare.status}
            </th>
            <th className="px-3 py-2">
              <span className="sr-only">{dict.answers.detail}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entries: AnswerDetailEntry[] = [];
            for (const id of answerOrder) {
              const answer = row.answers[id];
              if (answer) entries.push({ id, answer });
            }
            return (
              <tr key={row.key} className="border-b align-top last:border-b-0">
                {showState && row.stateSpan !== undefined && (
                  <td
                    rowSpan={row.stateSpan}
                    className="max-w-72 px-3 py-2 align-top"
                  >
                    <span
                      className="block truncate font-mono text-xs"
                      title={
                        row.state !== undefined
                          ? previewState(row.state, 1000)
                          : undefined
                      }
                    >
                      {row.state !== undefined ? previewState(row.state) : ""}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2">
                  <span className="block font-mono text-xs">{row.model}</span>
                </td>
                {answerOrder.map((id) => (
                  <td key={id} className="px-3 py-2">
                    {row.status === "done" && row.answers[id] ? (
                      <AnswerCell answer={row.answers[id]} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums">
                  {row.meta.latencyMs !== undefined
                    ? `${row.meta.latencyMs} ms`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span
                    className={
                      row.status === "error"
                        ? "text-red-600 dark:text-red-400"
                        : undefined
                    }
                  >
                    {statusLabel(row)}
                  </span>
                  {row.status === "error" && row.error && (
                    <span
                      className="block max-w-56 truncate text-xs text-red-600 dark:text-red-400"
                      title={row.error}
                    >
                      {row.error}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {(row.status === "done" || row.status === "error") && (
                    <AnswerDetailButton
                      groups={[
                        {
                          title: row.model,
                          meta: { ...row.meta, error: row.error },
                          entries,
                        },
                      ]}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const summaryStrip = summary && summary.length > 0 && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {summary.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">{item.label}</span>
          <span className="font-mono">
            {format(dict.bulk.progress, {
              done: item.done,
              total: item.total,
            })}
          </span>
          {item.avgLatencyMs !== undefined && (
            <span className="font-mono">
              {dict.bulk.avgLatency}
              {item.avgLatencyMs} ms
            </span>
          )}
          {item.tokens !== undefined && (
            <span className="font-mono" title={dict.bulk.tokens}>
              {item.tokens}
            </span>
          )}
          {item.failed !== undefined && item.failed > 0 && (
            <span className="text-red-600 dark:text-red-400">
              {format(dict.bulk.failedCount, { count: item.failed })}
            </span>
          )}
        </span>
      ))}
      {running && <span>{dict.bulk.rowRunning}</span>}
    </div>
  );

  if (!title) {
    return (
      <div className="space-y-3">
        {summaryStrip}
        {table}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {summaryStrip}
        {table}
      </CardContent>
    </Card>
  );
}
