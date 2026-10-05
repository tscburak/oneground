import Papa from "papaparse";
import type { DatasetRow, Label } from "./types";

export function parseDataset(
  text: string,
  format: "csv" | "json" | "jsonl",
): Record<string, unknown>[] {
  if (!text.trim()) throw new Error("Dataset is empty.");
  if (format === "csv") {
    const parsed = Papa.parse<Record<string, unknown>>(
      text.replace(/^\uFEFF/, ""),
      { header: true, skipEmptyLines: "greedy" },
    );
    if (parsed.errors.length)
      throw new Error(
        parsed.errors
          .map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`)
          .join("\n"),
      );
    if (
      new Set(parsed.meta.fields).size !== parsed.meta.fields?.length ||
      (parsed.meta.renamedHeaders &&
        Object.keys(parsed.meta.renamedHeaders).length)
    )
      throw new Error("Duplicate CSV headers.");
    return parsed.data;
  }
  const rows: unknown =
    format === "json"
      ? JSON.parse(text)
      : text.split(/\r?\n/).flatMap((line, i) => {
          if (!line.trim()) return [];
          try {
            return [JSON.parse(line)];
          } catch {
            throw new Error(`Row ${i + 1}: invalid JSON.`);
          }
        });
  if (!Array.isArray(rows) || !rows.length)
    throw new Error("Expected a non-empty array of records.");
  return rows.map((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error(`Row ${i + 1}: expected an object.`);
    return row as Record<string, unknown>;
  });
}

export function field(record: unknown, path: string): unknown {
  if (!path) return record;
  // CSV headers may contain dots; prefer a literal key before nested lookup.
  if (record && typeof record === "object" && Object.hasOwn(record, path))
    return (record as Record<string, unknown>)[path];
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      record,
    );
}

export function mapRows(
  records: Record<string, unknown>[],
  mapping: {
    id: string;
    state: string;
    labels: Record<string, string>;
    split: string;
    segment: string;
  },
): DatasetRow[] {
  const ids = new Set<string>();
  return records.map((record, i) => {
    const id = String(mapping.id ? (field(record, mapping.id) ?? "") : i + 1);
    if (!id || ids.has(id))
      throw new Error(`Row ${i + 1}: empty or duplicate ID.`);
    ids.add(id);
    let state = field(record, mapping.state);
    if (typeof state === "string" && /^[\[{]/.test(state.trim())) {
      try {
        state = JSON.parse(state);
      } catch {
        throw new Error(`Row ${i + 1}: invalid state JSON.`);
      }
    }
    if (
      state === null ||
      state === undefined ||
      !(typeof state === "string" || typeof state === "object")
    )
      throw new Error(`Row ${i + 1}: state must be text or JSON.`);
    const expected: Record<string, Label> = {};
    for (const [question, path] of Object.entries(mapping.labels)) {
      if (!path) continue;
      let value = field(record, path);
      if (value === undefined || value === null || value === "") continue;
      if (value === "true") value = true;
      if (value === "false") value = false;
      if (
        typeof value !== "string" &&
        typeof value !== "boolean" &&
        typeof value !== "number"
      )
        throw new Error(`Row ${i + 1}: label ${question} must be scalar.`);
      expected[question] = value;
    }
    const split = mapping.split ? field(record, mapping.split) : "validation";
    if (split !== "validation" && split !== "test")
      throw new Error(`Row ${i + 1}: split must be validation or test.`);
    return {
      id,
      state: state as string | object,
      expected,
      split,
      segment: String(field(record, mapping.segment) ?? ""),
    };
  });
}
