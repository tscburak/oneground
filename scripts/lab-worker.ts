import {
  claimRun,
  db,
  getRun,
  getStatus,
  saveItem,
  setStatus,
} from "../lib/lab/store";
import { evaluate, EvaluationError } from "../lib/lab/evaluators";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
async function main() {
  console.log("OneGround worker ready. SQLite queue, concurrency 3.");
  while (!stopping) {
    const id = claimRun();
    if (!id) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    const heartbeat = setInterval(
      () =>
        db().prepare("UPDATE jobs SET lease=? WHERE id=?").run(Date.now(), id),
      10_000,
    );
    try {
      const run = getRun(id);
      const rows = new Map(run.dataset.rows.map((row) => [row.id, row]));
      const evaluators = new Map(
        run.evaluators.map((evaluator) => [evaluator.id, evaluator]),
      );
      const pending = run.items.filter(
        (item) => item.status === "pending" || item.status === "running",
      );
      let cursor = 0;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (!stopping && cursor < pending.length) {
            const item = pending[cursor++];
            if (getStatus(id) !== "running") return;
            const running = {
              ...item,
              status: "running" as const,
              attempts: item.attempts + 1,
              startedAt: new Date().toISOString(),
            };
            saveItem(id, running);
            try {
              const row = rows.get(item.rowId)!;
              const evaluator = evaluators.get(item.evaluatorId)!;
              const result = await evaluate(
                evaluator,
                row.state,
                run.schema,
                run.evaluators,
              );
              saveItem(id, {
                ...running,
                ...result,
                status: "done",
                completedAt: new Date().toISOString(),
                error: undefined,
              });
            } catch (error) {
              saveItem(id, {
                ...running,
                status: "error",
                completedAt: new Date().toISOString(),
                ...(error instanceof EvaluationError
                  ? {
                      raw: error.raw,
                      latencyMs: error.latencyMs,
                      inputTokens: error.inputTokens,
                      outputTokens: error.outputTokens,
                    }
                  : {}),
                error:
                  error instanceof Error ? error.message : "Evaluation failed.",
              });
            }
          }
        }),
      );
      if (getStatus(id) === "running")
        setStatus(id, stopping ? "queued" : "complete");
    } finally {
      clearInterval(heartbeat);
      db().prepare("UPDATE jobs SET lease=0 WHERE id=?").run(id);
    }
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
