import { z } from "zod";
import { ABSTAIN } from "./types";
const label = z.union([z.string(), z.number().finite(), z.boolean()]);
const unit = z.number().min(0).max(1);
export const policyValidator = z.object({
  threshold: unit,
  confidence: unit,
  reviewMargin: z.number().min(0).max(0.5),
  scoreBoundary: z.number().finite().nullable(),
});
export const evaluatorValidator = z.object({
  profileId: z.string().min(1).optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["rules", "system-one", "llm", "cascade"]),
  model: z.string(),
  baseUrl: z.string(),
  prompt: z.string(),
  rules: z.array(
    z.object({
      question: z.string(),
      path: z.string(),
      operator: z.enum(["contains", "equals", "gt", "regex"]),
      value: z.string().max(500),
      output: label,
    }),
  ),
  defaults: z.record(z.string(), label),
  inputPrice: z.number().nonnegative().nullable(),
  outputPrice: z.number().nonnegative().nullable(),
  stages: z.array(z.string()).optional(),
  fallbackConfidence: unit.optional(),
});
export const rowValidator = z.object({
  id: z.string().min(1),
  state: z.union([
    z.string(),
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
  ]),
  expected: z.record(z.string(), label),
  split: z.enum(["validation", "test"]),
  segment: z.string(),
});
export const draftValidator = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("noul"),
    instructions: z.string().min(1),
    trueCriteria: z.string(),
    falseCriteria: z.string(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("choice"),
    instructions: z.string().min(1),
    options: z
      .array(
        z.object({
          key: z
            .string()
            .min(1)
            .refine((value) => value !== ABSTAIN, "Reserved abstention label."),
          description: z.string(),
        }),
      )
      .min(2)
      .max(255),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("score"),
    instructions: z.string().min(1),
    levels: z.array(z.string().min(1)).min(2).max(10),
  }),
]);
