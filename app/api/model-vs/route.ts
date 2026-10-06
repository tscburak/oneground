import { z } from "zod";
import { randomUUID } from "node:crypto";
import { buildQuestions, validateDrafts } from "@/lib/typesafe";
import {
  draftValidator,
  rowValidator,
  validateLabels,
} from "@/lib/lab/validation";
import { EvaluationError, evaluate } from "@/lib/lab/evaluators";
import type { Evaluator, Schema } from "@/lib/lab/types";
import { getModelProfile } from "@/lib/model-settings";

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
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 20_000_000) throw new Error("Request exceeds 20 MB.");
    const body = JSON.parse(text);
    const stamp = { id: randomUUID(), createdAt: new Date().toISOString() };
    const input = z
      .object({
        profileIds: z
          .array(z.string().min(1))
          .min(2)
          .max(6)
          .refine((ids) => new Set(ids).size === ids.length),
        drafts: z.array(draftValidator).min(1).max(25),
        state: rowValidator.shape.state,
      })
      .parse(body);
    const validation = validateDrafts(input.drafts);
    if (validation) throw new Error(validation);
    const schema: Schema = {
      ...stamp,
      name: "Model vs",
      drafts: input.drafts,
      questions: buildQuestions(input.drafts),
    };
    const evaluators: Evaluator[] = input.profileIds.map((profileId) => {
      const profile = getModelProfile(profileId);
      return {
        id: profile.id,
        profileId: profile.id,
        name: profile.name,
        kind: profile.kind,
        model: profile.model,
        baseUrl: profile.baseUrl,
        prompt: profile.prompt,
        rules: [],
        defaults: {},
        inputPrice: profile.inputPrice,
        outputPrice: profile.outputPrice,
      };
    });
    validateEvaluators(evaluators, schema);
    const results = await Promise.all(
      evaluators.map(async (evaluator) => {
        const started = performance.now();
        try {
          const result = await evaluate(evaluator, input.state, schema);
          const inputTokens = result.inputTokens ?? null;
          const outputTokens = result.outputTokens ?? null;
          return {
            profileId: evaluator.profileId,
            name: evaluator.name,
            kind: evaluator.kind,
            configuredModel: evaluator.model,
            resolvedModel: result.resolvedModel ?? evaluator.model,
            status: "done" as const,
            answers: result.answers,
            latencyMs: result.latencyMs,
            inputTokens,
            outputTokens,
            totalTokens:
              inputTokens === null || outputTokens === null
                ? null
                : inputTokens + outputTokens,
            costUsd:
              inputTokens === null ||
              outputTokens === null ||
              evaluator.inputPrice === null ||
              evaluator.outputPrice === null
                ? null
                : (inputTokens * evaluator.inputPrice +
                    outputTokens * evaluator.outputPrice) /
                  1_000_000,
          };
        } catch (error) {
          return {
            profileId: evaluator.profileId,
            name: evaluator.name,
            kind: evaluator.kind,
            configuredModel: evaluator.model,
            resolvedModel: evaluator.model,
            status: "error" as const,
            error:
              error instanceof Error ? error.message : "Evaluation failed.",
            latencyMs:
              error instanceof EvaluationError
                ? error.latencyMs
                : Math.round(performance.now() - started),
            inputTokens:
              error instanceof EvaluationError
                ? (error.inputTokens ?? null)
                : null,
            outputTokens:
              error instanceof EvaluationError
                ? (error.outputTokens ?? null)
                : null,
            totalTokens:
              error instanceof EvaluationError &&
              error.inputTokens !== undefined &&
              error.outputTokens !== undefined
                ? error.inputTokens + error.outputTokens
                : null,
            costUsd: null,
          };
        }
      }),
    );
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
