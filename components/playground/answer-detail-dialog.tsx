"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { format, useI18n } from "@/components/i18n";
import { ConfidenceMeter } from "@/components/playground/answer-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Answer, Usage } from "@/lib/typesafe";

export type AnswerDetailMeta = {
  model?: string;
  provider?: string;
  latencyMs?: number;
  usage?: Usage;
  error?: string | null;
};

export type AnswerDetailEntry = { id: string; answer: Answer };

export type AnswerDetailGroup = {
  title?: string;
  meta?: AnswerDetailMeta;
  entries: AnswerDetailEntry[];
};

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function noulTone(noul: number): string {
  if (noul >= 0.75) return "text-emerald-600 dark:text-emerald-400";
  if (noul <= 0.25) return "text-red-600 dark:text-red-400";
  return "";
}

function primaryValue(answer: Answer): string {
  if (answer.type === "noul") return answer.noul.toFixed(3);
  if (answer.type === "choice") {
    return `${answer.choice} · ${pct(answer.probabilities[answer.choice] ?? 0)}`;
  }
  return answer.score.toFixed(2);
}

function ProbabilityChips({ answer }: { answer: Answer }) {
  if (answer.type === "noul") return null;
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(answer.probabilities).map(([key, value]) => {
        const chosen = answer.type === "choice" && key === answer.choice;
        const legend = answer.type === "score" ? answer.legend[key] : undefined;
        return (
          <span
            key={key}
            title={legend || undefined}
            className={cn(
              "rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
              chosen && "bg-foreground text-background",
            )}
          >
            {key} {pct(value)}
          </span>
        );
      })}
    </div>
  );
}

function AnswerRow({ id, answer }: AnswerDetailEntry) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline">{answer.type}</Badge>
          <span className="truncate font-mono text-sm">{id}</span>
        </div>
        <span
          className={cn(
            "shrink-0 font-mono text-sm font-semibold tabular-nums",
            answer.type === "noul" && noulTone(answer.noul),
          )}
        >
          {primaryValue(answer)}
        </span>
      </div>
      <ProbabilityChips answer={answer} />
      {answer.type !== "noul" && <ConfidenceMeter value={answer.confidence} />}
    </div>
  );
}

function MetaRow({ meta }: { meta: AnswerDetailMeta }) {
  const dict = useI18n();
  const showTokens =
    meta.usage &&
    (meta.usage.input_tokens !== undefined ||
      meta.usage.output_tokens !== undefined);
  if (
    meta.latencyMs === undefined &&
    !showTokens &&
    !meta.provider &&
    !meta.model
  ) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {meta.latencyMs !== undefined && (
        <div>
          <span className="text-muted-foreground">{dict.answers.latency}</span>
          <span className="font-mono">{meta.latencyMs} ms</span>
        </div>
      )}
      {showTokens && (
        <div>
          <span className="text-muted-foreground">{dict.answers.tokens}</span>
          <span className="font-mono">
            {format(dict.answers.tokensInOut, {
              input: meta.usage?.input_tokens ?? 0,
              output: meta.usage?.output_tokens ?? 0,
            })}
          </span>
        </div>
      )}
      {meta.provider && (
        <div>
          <span className="text-muted-foreground">{dict.answers.provider}</span>
          <span className="font-mono">{meta.provider}</span>
        </div>
      )}
      {meta.model && (
        <div>
          <span className="text-muted-foreground">{dict.answers.model}</span>
          <span className="font-mono">{meta.model}</span>
        </div>
      )}
    </div>
  );
}

export function AnswerDetailButton({
  groups,
  className,
}: {
  groups: AnswerDetailGroup[];
  className?: string;
}) {
  const dict = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={className}
        aria-label={dict.answers.detail}
        title={dict.answers.detail}
        onClick={() => setOpen(true)}
      >
        <Info />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dict.answers.detailTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              {dict.answers.detailTitle}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {groups.map((group, index) => (
              <div key={index} className="space-y-2">
                {group.title && (
                  <p className="text-sm font-medium">{group.title}</p>
                )}
                {group.meta && <MetaRow meta={group.meta} />}
                {group.meta?.error && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {group.meta.error}
                  </p>
                )}
                {group.entries.length > 0 ? (
                  <div className="space-y-2">
                    {group.entries.map((entry) => (
                      <AnswerRow key={entry.id} {...entry} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
