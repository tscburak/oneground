export type EvalFormat = "csv" | "tsv" | "json" | "jsonl" | "xml" | "xlsx";

export type EvalRecord = Record<string, unknown>;

function stripBom(text: string): string {
  return text.replace(/^﻿/, "");
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

// Minimal CSV/TSV parser: handles quoted fields, escaped quotes, embedded
// newlines inside quotes. No external dependency.
export function parseDelimited(
  text: string,
  delimiter: "," | "\t" | ";" = ",",
): EvalRecord[] {
  const input = stripBom(text);
  if (!input.trim()) throw new Error("Dataset is empty.");
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    current.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Skip fully empty rows.
    if (current.some((cell) => cell.trim() !== "")) rows.push(current);
    current = [];
  };
  while (i < input.length) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
    } else if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === delimiter) {
      pushField();
      i += 1;
    } else if (char === "\r" || char === "\n") {
      pushRow();
      if (char === "\r" && input[i + 1] === "\n") i += 2;
      else i += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  pushRow();
  if (inQuotes) throw new Error("Unterminated quoted field in CSV/TSV.");
  if (rows.length < 2) throw new Error("Expected a header row plus data rows.");
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header))
    throw new Error("CSV/TSV headers must not be empty.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Duplicate CSV/TSV headers.");
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(
        `Row ${index + 2}: expected ${headers.length} cells, got ${cells.length}.`,
      );
    const record: EvalRecord = {};
    for (let column = 0; column < headers.length; column += 1) {
      const raw = cells[column].trim();
      record[headers[column]] = coerceScalar(raw);
    }
    return record;
  });
}

// Native Excel cell values keep their types; strings go through the same
// coercion as CSV fields ("true" -> true, "42" -> 42, JSON objects parsed).
function coerceCell(cell: unknown): unknown {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : String(cell);
  if (typeof cell === "boolean") return cell;
  if (cell instanceof Date)
    return Number.isNaN(cell.getTime()) ? "" : cell.toISOString();
  return coerceScalar(String(cell).trim());
}

// Shared row validation for CSV/TSV and Excel sheet rows (first row headers).
// Short Excel rows are padded with ""; longer rows throw (misaligned sheet).
export function rowsToRecords(rows: unknown[][]): EvalRecord[] {
  const data = rows.filter((row) =>
    (Array.isArray(row) ? row : []).some(
      (cell) => cell !== null && cell !== undefined && String(cell).trim() !== "",
    ),
  );
  if (data.length < 2) throw new Error("Expected a header row plus data rows.");
  const headers = data[0].map((header) => String(header ?? "").trim());
  if (headers.some((header) => !header))
    throw new Error("First-row headers must not be empty.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Duplicate headers in first row.");
  return data.slice(1).map((cells, index) => {
    if (cells.length > headers.length)
      throw new Error(
        `Row ${index + 2}: expected ${headers.length} cells, got ${cells.length}.`,
      );
    const padded = [...cells];
    while (padded.length < headers.length) padded.push("");
    const record: EvalRecord = {};
    for (let column = 0; column < headers.length; column += 1) {
      record[headers[column]] = coerceCell(padded[column]);
    }
    return record;
  });
}

function coerceScalar(raw: string): unknown {
  if (raw === "") return "";
  if (/^[\[{]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

export function parseJsonRecords(text: string): EvalRecord[] {
  const input = stripBom(text).trim();
  if (!input) throw new Error("Dataset is empty.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Invalid JSON. Expected an array of objects.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error("Expected a non-empty array of records.");
  return parsed.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error(`Row ${index + 1}: expected an object.`);
    return row as EvalRecord;
  });
}

export function parseJsonlRecords(text: string): EvalRecord[] {
  const lines = splitLines(stripBom(text));
  if (!lines.length) throw new Error("Dataset is empty.");
  return lines.map((line, index) => {
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new Error(`Row ${index + 1}: expected an object.`);
      return row as EvalRecord;
    } catch {
      throw new Error(`Row ${index + 1}: invalid JSON.`);
    }
  });
}

// Minimal XML parser without DOM dependency (works in Node and browser).
// Detects repeating record elements (<row>, <record>, <item>, <entry> or the
// most frequent child tag) and flattens leaf tags into fields.
export function parseXmlRecords(text: string): EvalRecord[] {
  const input = stripBom(text).trim();
  if (!input) throw new Error("Dataset is empty.");
  const openTagPattern = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>/g;
  const counts = new Map<string, number>();
  let match: RegExpExecArray | null;
  while ((match = openTagPattern.exec(input)) !== null) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  const candidates = ["row", "record", "item", "entry", "object"];
  const sortedByCount = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
  const orderedTags = [
    ...candidates.filter((tag) => (counts.get(tag) ?? 0) >= 1),
    ...sortedByCount.filter(
      (tag) => !candidates.includes(tag) && (counts.get(tag) ?? 0) >= 2,
    ),
  ];
  const extractBlocks = (tag: string): string[] => {
    const blockPattern = new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "g",
    );
    const found: string[] = [];
    let block: RegExpExecArray | null;
    while ((block = blockPattern.exec(input)) !== null) {
      found.push(block[1]);
    }
    return found;
  };
  const parseBlock = (block: string): EvalRecord => {
    const record: EvalRecord = {};
    const leafPattern =
      /<([A-Za-z_][\w.-]*)>([^<>]*)<\/\1>/g;
    let leaf: RegExpExecArray | null;
    while ((leaf = leafPattern.exec(block)) !== null) {
      record[leaf[1]] = coerceScalar(leaf[2].trim());
    }
    // Nested one-level objects: <a><b>v</b></a> inside block.
    const nestedPattern =
      /<([A-Za-z_][\w.-]*)>([\s\S]*?<[A-Za-z_][\w.-]*>[\s\S]*?)<\/\1>/g;
    let nested: RegExpExecArray | null;
    while ((nested = nestedPattern.exec(block)) !== null) {
      if (nested[2].includes("<")) {
        const child: EvalRecord = {};
        const childPattern =
          /<([A-Za-z_][\w.-]*)>([^<>]*)<\/\1>/g;
        let childMatch: RegExpExecArray | null;
        while (
          (childMatch = childPattern.exec(nested[2])) !== null
        ) {
          child[childMatch[1]] = coerceScalar(childMatch[2].trim());
        }
        if (Object.keys(child).length > 0 && !(nested[1] in record)) {
          record[nested[1]] = child;
        }
      }
    }
    return record;
  };
  for (const tag of orderedTags) {
    const blocks = extractBlocks(tag);
    if (blocks.length === 0) continue;
    const records = blocks.map(parseBlock);
    if (records.every((record) => Object.keys(record).length > 0))
      return records;
  }
  // Single-record document: treat top-level leaf tags as one record.
  const single = parseBlock(input);
  if (Object.keys(single).length === 0)
    throw new Error(
      "Could not find records in XML. Use repeating <row>/<record>/<item> elements.",
    );
  return [single];
}

export function parseDataset(text: string, format: EvalFormat): EvalRecord[] {
  switch (format) {
    case "csv":
      return parseDelimited(text, ",");
    case "tsv":
      return parseDelimited(text, "\t");
    case "json":
      return parseJsonRecords(text);
    case "jsonl":
      return parseJsonlRecords(text);
    case "xml":
      return parseXmlRecords(text);
    case "xlsx":
      throw new Error(
        "Excel files must be read as binary. Convert the first sheet to rows, then use rowsToRecords().",
      );
  }
}

export function detectFormat(filename: string, text: string): EvalFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) return "jsonl";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".xml")) return "xml";
  if (lower.endsWith(".tsv") || lower.endsWith(".tab")) return "tsv";
  if (lower.endsWith(".csv")) return "csv";
  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xlsm") ||
    lower.endsWith(".xlsb") ||
    lower.endsWith(".xls")
  )
    return "xlsx";
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) return "xml";
  if (trimmed.startsWith("[")) return "json";
  if (trimmed.split("\n").every((line) => {
    const value = line.trim();
    return !value || value.startsWith("{");
  })) return "jsonl";
  return "csv";
}

export function getField(record: unknown, path: string): unknown {
  if (!path) return record;
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

export function listFields(records: EvalRecord[]): string[] {
  const fields = new Set<string>();
  const visit = (value: unknown, prefix: string) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        fields.add(path);
        if (child && typeof child === "object" && !Array.isArray(child)) {
          visit(child, path);
        }
      }
    } else if (prefix) {
      fields.add(prefix);
    }
  };
  for (const record of records.slice(0, 50)) visit(record, "");
  return [...fields].sort();
}

export function toStateValue(value: unknown): string | object {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[\[{]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        // Fall through to plain string.
      }
    }
    return value;
  }
  if (value && typeof value === "object") return value as object;
  if (value === null || value === undefined)
    throw new Error("State field is empty for a row.");
  return String(value);
}

export function normalizeLabel(value: unknown): string | number | boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }
  throw new Error("Expected answer must be a string, number or boolean.");
}
