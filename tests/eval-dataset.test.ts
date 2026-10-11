import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  detectFormat,
  getField,
  listFields,
  parseDataset,
  rowsToRecords,
  toStateValue,
} from "../lib/eval-lab/dataset";
import {
  buildSampleRecords,
  sampleSheetRows,
  serializeSample,
} from "../lib/eval-lab/samples";
import { scoreRow, summarizeModel } from "../lib/eval-lab/metrics";

test("CSV with quotes and JSON cells parses to records", () => {
  const records = parseDataset(
    `state,urgent\n"hello, world",true\n"{""a"":1}",false`,
    "csv",
  );
  assert.equal(records.length, 2);
  assert.equal(records[0].state, "hello, world");
  assert.equal(records[0].urgent, true);
  assert.deepEqual(records[1].state, { a: 1 });
});

test("JSON and JSONL parse to record arrays", () => {
  assert.equal(
    parseDataset(`[{"a":1},{"a":2}]`, "json").length,
    2,
  );
  assert.equal(
    parseDataset(`{"a":1}\n{"a":2}`, "jsonl").length,
    2,
  );
});

test("XML with repeating rows parses leaf fields", () => {
  const records = parseDataset(
    `<rows><row><text>hi</text><urgent>true</urgent></row><row><text>bye</text><urgent>false</urgent></row></rows>`,
    "xml",
  );
  assert.equal(records.length, 2);
  assert.equal(records[0].text, "hi");
  assert.equal(records[1].urgent, false);
});

test("Field listing prefers literal keys with dots", () => {
  const fields = listFields([{ "a.b": 1, a: { b: 2 } }]);
  assert.ok(fields.includes("a.b"));
  assert.equal(getField({ "a.b": 1 }, "a.b"), 1);
});

test("State coercion keeps objects and parses JSON strings", () => {
  assert.deepEqual(toStateValue({ a: 1 }), { a: 1 });
  assert.deepEqual(toStateValue(`{"a":1}`), { a: 1 });
  assert.equal(toStateValue("plain"), "plain");
});

test("Scoring compares booleans, numbers and strings case-insensitively", () => {
  const row = scoreRow(
    "1",
    "hi",
    { urgent: true, topic: "billing" },
    {
      urgent: { type: "noul", noul: 0.9 },
      topic: { type: "choice", choice: "Billing", probabilities: { Billing: 1 }, confidence: 1 },
    },
    ["urgent", "topic"],
    null,
  );
  assert.equal(row.correct.urgent, true);
  assert.equal(row.correct.topic, true);
  const summary = summarizeModel("p1", "M", [row], ["urgent", "topic"], [10]);
  assert.equal(summary.accuracy, 1);
  assert.equal(summary.avgLatencyMs, 10);
});

test("Format detection follows filename then content", () => {
  assert.equal(detectFormat("data.xml", "<a/>"), "xml");
  assert.equal(detectFormat("data.csv", "a,b\n1,2"), "csv");
  assert.equal(detectFormat("unknown", `{"a":1}`), "jsonl");
  assert.equal(detectFormat("data.xlsx", ""), "xlsx");
  assert.equal(detectFormat("legacy.xls", ""), "xlsx");
});

test("Sheet rows keep native types and coerce strings like CSV", () => {
  const records = rowsToRecords([
    ["state", "urgent", "count"],
    ["hello", true, 3],
    ["  {\"a\":1}  ", "TRUE", ""],
  ]);
  assert.equal(records.length, 2);
  assert.equal(records[0].state, "hello");
  assert.equal(records[0].urgent, true);
  assert.equal(records[0].count, 3);
  assert.deepEqual(records[1].state, { a: 1 });
  assert.equal(records[1].urgent, "TRUE");
  assert.equal(records[1].count, "");
});

test("Sheet rows convert dates, skip empty rows and pad short rows", () => {
  const records = rowsToRecords([
    ["when", "label"],
    ["", ""],
    [new Date("2024-01-15T00:00:00.000Z"), "x"],
    [null, undefined],
    ["only-one"],
  ]);
  assert.equal(records.length, 2);
  assert.equal(records[0].when, "2024-01-15T00:00:00.000Z");
  assert.equal(records[1].when, "only-one");
  assert.equal(records[1].label, "");
});

test("Sheet rows reject bad headers and overlong rows", () => {
  assert.throws(() => rowsToRecords([["a", "a"], [1, 2]]), /Duplicate/);
  assert.throws(() => rowsToRecords([["a", ""], [1, 2]]), /empty/);
  assert.throws(() => rowsToRecords([["only-header"]]), /header row plus/);
  assert.throws(
    () => rowsToRecords([["a"], [1, 2]]),
    /expected 1 cells, got 2/,
  );
});

test("xlsx workbook round-trips through sheet rows", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["state", "urgent"],
      ["hi", true],
      ["bye", false],
    ]),
    "Sheet1",
  );
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const reread = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    reread.Sheets[reread.SheetNames[0]],
    { header: 1, defval: "", blankrows: false },
  ) as unknown as unknown[][];
  const records = rowsToRecords(rows);
  assert.equal(records.length, 2);
  assert.equal(records[0].state, "hi");
  assert.equal(records[0].urgent, true);
  assert.equal(records[1].urgent, false);
});

test("Sample downloads follow the loaded questions and parse back", () => {
  const ids = ["department", "is_urgent", "frustration"];
  const records = buildSampleRecords(ids);
  assert.equal(records.length, 5);
  assert.deepEqual(Object.keys(records[0]), ["id", "state", ...ids]);
  assert.ok(
    records.every((row) => ids.every((id) => row[id] === "")),
  );
  for (const format of ["csv", "tsv", "json", "jsonl", "xml"] as const) {
    const parsed = parseDataset(serializeSample(records, format), format);
    assert.equal(parsed.length, 5, format);
    assert.deepEqual(listFields(parsed).sort(), [
      "department",
      "frustration",
      "id",
      "is_urgent",
      "state",
    ]);
    assert.equal(parsed[0].id, 1);
    assert.equal(parsed[0].state, "");
  }
  const bare = buildSampleRecords([]);
  assert.deepEqual(Object.keys(bare[0]), ["id", "state"]);
  assert.equal(parseDataset(serializeSample(bare, "csv"), "csv").length, 5);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(sampleSheetRows(records)),
    "dataset",
  );
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const reread = XLSX.read(buffer, { type: "buffer" });
  const excel = rowsToRecords(
    XLSX.utils.sheet_to_json<unknown[]>(
      reread.Sheets[reread.SheetNames[0]],
      { header: 1, defval: "", blankrows: false },
    ) as unknown as unknown[][],
  );
  assert.equal(excel.length, 5);
  assert.equal(excel[0].id, 1);
  assert.equal(excel[2].department, "");
});
