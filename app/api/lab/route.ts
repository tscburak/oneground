import { z } from "zod";
import { randomUUID } from "node:crypto";
import { buildQuestions, validateDrafts } from "@/lib/typesafe";
import {
  createRun,
  db,
  getEntity,
  getRun,
  listEntities,
  listRuns,
  saveEntity,
  saveItem,
  setStatus,
} from "@/lib/lab/store";
import {
  draftValidator,
  evaluatorValidator,
  policyValidator,
  rowValidator,
} from "@/lib/lab/validation";
import { validateLabels } from "@/lib/lab/metrics";
import { evaluate } from "@/lib/lab/evaluators";
import type { Dataset, Evaluator, Run, Schema } from "@/lib/lab/types";

export const runtime = "nodejs";
function validateEvaluators(evaluators: Evaluator[], schema: Schema) {
  if (new Set(evaluators.map((e) => e.id)).size !== evaluators.length)
    throw new Error("Duplicate evaluator IDs.");
  for (const evaluator of evaluators) {
    if (evaluator.kind === "cascade") {
      if (
        !evaluator.stages?.length ||
        new Set(evaluator.stages).size !== evaluator.stages.length ||
        evaluator.stages.some(
          (id) => !evaluators.some((e) => e.id === id && e.kind !== "cascade"),
        )
      )
        throw new Error(
          "Cascade requires unique stages referencing ordinary evaluators.",
        );
    } else if (evaluator.kind === "rules") {
      for (const rule of evaluator.rules) {
        if (!schema.questions[rule.question])
          throw new Error(`Unknown rule question ${rule.question}.`);
        validateLabels(
          [
            {
              id: "rule",
              state: "",
              expected: { [rule.question]: rule.output },
              split: "validation",
              segment: "",
            },
          ],
          schema.questions,
        );
        if (rule.operator === "regex") {
          if (/\)[+*{]|\\[1-9]/.test(rule.value))
            throw new Error(
              "Repeated regex groups/backreferences are unsupported.",
            );
          new RegExp(rule.value);
        }
      }
      validateLabels(
        [
          {
            id: "default",
            state: "",
            expected: evaluator.defaults,
            split: "validation",
            segment: "",
          },
        ],
        schema.questions,
      );
    } else {
      if (!evaluator.model.trim())
        throw new Error("Evaluator model is required.");
      const url = new URL(evaluator.baseUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error(
          "Endpoint URL must be HTTP(S), without credentials, query or fragment.",
        );
    }
  }
}
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("run");
    return Response.json(
      id
        ? getRun(id)
        : {
            datasets: listEntities<Dataset>("dataset"),
            schemas: listEntities<Schema>("schema"),
            runs: listRuns(),
          },
    );
  } catch {
    return Response.json({ error: "Record not found." }, { status: 404 });
  }
}
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 20_000_000) throw new Error("Request exceeds 20 MB.");
    const body = JSON.parse(text);
    const stamp = { id: randomUUID(), createdAt: new Date().toISOString() };
    if (body.action === "preview") {
      const input = z
        .object({
          drafts: z.array(draftValidator).min(1).max(100),
          evaluator: evaluatorValidator,
          state: rowValidator.shape.state,
        })
        .parse(body);
      const validation = validateDrafts(input.drafts);
      if (validation) throw new Error(validation);
      const schema: Schema = {
        ...stamp,
        name: "preview",
        drafts: input.drafts,
        questions: buildQuestions(input.drafts),
      };
      validateEvaluators([input.evaluator], schema);
      return Response.json(
        await evaluate(input.evaluator, input.state, schema),
      );
    }
    if (body.action === "dataset") {
      const input = z
        .object({
          name: z.string().trim().min(1).max(120),
          rows: z.array(rowValidator).min(1).max(10_000),
        })
        .parse(body);
      if (new Set(input.rows.map((row) => row.id)).size !== input.rows.length)
        throw new Error("Duplicate row IDs.");
      const value: Dataset = { ...stamp, ...input };
      saveEntity("dataset", value);
      return Response.json(value);
    }
    if (body.action === "schema") {
      const input = z
        .object({
          name: z.string().trim().min(1).max(120),
          drafts: z.array(draftValidator).min(1).max(100),
        })
        .parse(body);
      const error = validateDrafts(input.drafts);
      if (error) throw new Error(error);
      const value: Schema = {
        ...stamp,
        ...input,
        questions: buildQuestions(input.drafts),
      };
      saveEntity("schema", value);
      return Response.json(value);
    }
    if (body.action === "run") {
      const input = z
        .object({
          name: z.string().trim().min(1),
          datasetId: z.string(),
          schemaId: z.string(),
          evaluators: z.array(evaluatorValidator).min(1).max(6),
          policy: policyValidator,
        })
        .parse(body);
      const dataset = getEntity<Dataset>(input.datasetId, "dataset"),
        schema = getEntity<Schema>(input.schemaId, "schema");
      validateLabels(dataset.rows, schema.questions);
      validateEvaluators(input.evaluators, schema);
      const run: Run = {
        ...stamp,
        name: input.name,
        dataset,
        schema,
        evaluators: input.evaluators,
        policy: input.policy,
        status: "queued",
        items: dataset.rows.flatMap((row) =>
          input.evaluators.map((e) => ({
            rowId: row.id,
            evaluatorId: e.id,
            status: "pending",
            attempts: 0,
          })),
        ),
      };
      createRun(run);
      return Response.json(run);
    }
    const input = z
      .object({
        id: z.string(),
        action: z.enum(["cancel", "resume", "retry", "replay"]),
        policy: policyValidator.optional(),
        mode: z.enum(["policy", "inference"]).optional(),
        rowIds: z.array(z.string()).optional(),
        evaluators: z.array(evaluatorValidator).min(1).max(6).optional(),
        schemaId: z.string().optional(),
      })
      .parse(body);
    const run = getRun(input.id);
    if (input.action === "cancel") {
      setStatus(run.id, "cancelled");
      return Response.json(getRun(run.id));
    }
    if (input.action === "resume" || input.action === "retry") {
      if (run.status === "running" || run.status === "queued")
        throw new Error("Cancel or wait for the run before retry/resume.");
      const job = db()
        .prepare("SELECT lease FROM jobs WHERE id=?")
        .get(run.id) as { lease: number };
      if (job.lease > Date.now() - 60_000)
        throw new Error(
          "Worker is finishing in-flight requests. Retry shortly.",
        );
      db().transaction(() => {
        for (const item of run.items)
          if (
            item.status === "running" ||
            (input.action === "retry" && item.status === "error")
          )
            saveItem(run.id, { ...item, status: "pending", error: undefined });
        setStatus(run.id, "queued");
      })();
      return Response.json(getRun(run.id));
    }
    const mode = input.mode ?? "policy";
    if (
      mode === "policy" &&
      run.status !== "complete" &&
      run.status !== "cancelled"
    )
      throw new Error("Wait or cancel before policy replay.");
    const dataset = {
      ...run.dataset,
      rows: run.dataset.rows.filter(
        (row) => !input.rowIds || input.rowIds.includes(row.id),
      ),
    };
    if (!dataset.rows.length) throw new Error("No rows selected.");
    const schema =
      mode === "inference" && input.schemaId
        ? getEntity<Schema>(input.schemaId, "schema")
        : run.schema;
    const evaluators =
      mode === "inference" && input.evaluators
        ? input.evaluators
        : run.evaluators;
    validateLabels(dataset.rows, schema.questions);
    validateEvaluators(evaluators, schema);
    const replay: Run = {
      ...run,
      ...stamp,
      dataset,
      schema,
      evaluators,
      policy: input.policy ?? run.policy,
      name: `${run.name} · ${mode} replay`,
      parentId: run.id,
      replay: mode,
      status: mode === "policy" ? "complete" : "queued",
      items:
        mode === "policy"
          ? run.items.filter((item) =>
              dataset.rows.some((row) => row.id === item.rowId),
            )
          : dataset.rows.flatMap((row) =>
              evaluators.map((e) => ({
                rowId: row.id,
                evaluatorId: e.id,
                status: "pending",
                attempts: 0,
              })),
            ),
    };
    createRun(replay);
    return Response.json(replay);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
