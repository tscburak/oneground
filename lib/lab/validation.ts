import { z } from "zod";
import { ABSTAIN } from "./types";
import type { DatasetRow, Run } from "./types";
const label = z.union([z.string(), z.number().finite(), z.boolean()]);
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
