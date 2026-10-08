import type { Answer } from "@/lib/typesafe";
import { cn } from "@/lib/utils";

function pctShort(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function tone(noul: number): string {
  if (noul >= 0.75) return "text-emerald-600 dark:text-emerald-400";
  if (noul <= 0.25) return "text-red-600 dark:text-red-400";
  return "";
}

export function AnswerCell({ answer }: { answer: Answer | undefined }) {
  if (!answer) return <span className="text-muted-foreground">—</span>;
  if (answer.type === "noul") {
    return (
      <span className={cn("font-mono text-xs tabular-nums", tone(answer.noul))}>
        {answer.noul.toFixed(3)}
      </span>
    );
  }
  if (answer.type === "choice") {
    return (
      <span className="font-mono text-xs">
        {answer.choice}
        <span className="ml-1 text-muted-foreground">
          {pctShort(answer.probabilities[answer.choice] ?? 0)}
        </span>
      </span>
    );
  }
  return (
    <span className="font-mono text-xs tabular-nums">
      {answer.score.toFixed(2)}
    </span>
  );
}
