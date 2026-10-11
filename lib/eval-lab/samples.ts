import type { EvalFormat } from "./dataset";

export type SampleTextFormat = Exclude<EvalFormat, "xlsx">;

export type SampleRow = Record<string, string | number>;

// Only the id column is filled. State and label columns stay blank for
// the user to fill in.
const SAMPLE_ROW_COUNT = 5;

export function sampleColumns(questionIds: string[]): string[] {
  return ["id", "state", ...questionIds];
}

export function buildSampleRecords(questionIds: string[]): SampleRow[] {
  return Array.from({ length: SAMPLE_ROW_COUNT }, (_, index) => {
    const row: SampleRow = { id: index + 1, state: "" };
    for (const id of questionIds) row[id] = "";
    return row;
  });
}

export function sampleFileName(format: EvalFormat): string {
  return `sample-dataset.${format}`;
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function serializeSample(
  records: SampleRow[],
  format: SampleTextFormat,
): string {
  const columns = records.length > 0 ? Object.keys(records[0]) : ["id", "state"];
  switch (format) {
    case "csv":
      return [
        columns.join(","),
        ...records.map((row) =>
          columns.map((column) => escapeCsv(row[column] ?? "")).join(","),
        ),
      ].join("\n");
    case "tsv":
      return [
        columns.join("\t"),
        ...records.map((row) =>
          columns
            .map((column) => String(row[column] ?? "").replace(/[\t\r\n]+/g, " "))
            .join("\t"),
        ),
      ].join("\n");
    case "json":
      return JSON.stringify(records);
    case "jsonl":
      return records.map((row) => JSON.stringify(row)).join("\n");
    case "xml":
      return [
        "<dataset>",
        ...records.map(
          (row) =>
            `  <row>\n${columns
              .map((column) => `    <${column}>${escapeXml(row[column] ?? "")}</${column}>`)
              .join("\n")}\n  </row>`,
        ),
        "</dataset>",
      ].join("\n");
  }
}

export function sampleSheetRows(records: SampleRow[]): unknown[][] {
  const columns = records.length > 0 ? Object.keys(records[0]) : ["id", "state"];
  return [
    columns,
    ...records.map((row) => columns.map((column) => row[column] ?? "")),
  ];
}
