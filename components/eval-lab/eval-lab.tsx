"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Info, Loader2, Play, Plus, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { format, useI18n } from "@/components/i18n";
import { useModelSettings } from "@/components/model-settings-provider";
import { QuestionEditor } from "@/components/playground/question-editor";
import { QuestionProfileButtons } from "@/components/question-profile-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ModelProfile } from "@/lib/model-settings-types";
import {
  buildQuestions,
  nextQuestionId,
  previewState,
  validateDrafts,
  type EvaluateResponse,
  type JsonStructure,
  type QuestionDraft,
  type QuestionsMap,
} from "@/lib/typesafe";
import {
  detectFormat,
  getField,
  listFields,
  normalizeLabel,
  parseDataset,
  rowsToRecords,
  toStateValue,
  type EvalFormat,
  type EvalRecord,
} from "@/lib/eval-lab/dataset";
import {
  buildSampleRecords,
  sampleFileName,
  sampleSheetRows,
  serializeSample,
} from "@/lib/eval-lab/samples";
import {
  formatPercent,
  scoreRow,
  summarizeModel,
  type EvalRowResult,
  type ModelAccuracy,
} from "@/lib/eval-lab/metrics";

const RUN_ROWS = 10;
const PARSE_MAX = 2000;
const MAX_MODELS = 6;
const CONCURRENCY = 3;
const PREVIEW_ROWS = 20;
const EXCEL_PATTERN = /\.(xlsx|xlsm|xlsb|xls)$/i;

type ModelRunState = {
  profileId: string;
  label: string;
  model: string;
  rows: EvalRowResult[];
  latencies: number[];
  done: number;
  summary: ModelAccuracy | null;
};

type PreparedRow = {
  rowId: string;
  state: JsonStructure;
  preview: string;
  expected: Record<string, string | number | boolean>;
};

export function EvalLab() {
  const dict = useI18n();
  const evalDict = dict.evalLab;
  const { settings } = useModelSettings();
  const systemProfiles = useMemo(
    () => settings?.models.filter((profile) => profile.kind === "system-one") ?? [],
    [settings],
  );

  const [datasetName, setDatasetName] = useState("");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [dataFormat, setDataFormat] = useState<EvalFormat>("json");
  const [excelRows, setExcelRows] = useState<unknown[][] | null>(null);
  const [excelSheet, setExcelSheet] = useState("");
  const [records, setRecords] = useState<EvalRecord[]>([]);
  const [parseError, setParseError] = useState("");
  const [drafts, setDrafts] = useState<QuestionDraft[]>([]);
  const [stateField, setStateField] = useState("");
  const [idField, setIdField] = useState("");
  const [expectedMap, setExpectedMap] = useState<Record<string, string>>({});
  const [overrideIds, setOverrideIds] = useState<string[] | null>(null);
  const [running, setRunning] = useState(false);
  const [modelRuns, setModelRuns] = useState<ModelRunState[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [step, setStep] = useState(0);
  const [datasetTab, setDatasetTab] = useState("file");
  const [dragOver, setDragOver] = useState(false);
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const target = (event as CustomEvent<number>).detail;
      if (typeof target === "number") setStep(Math.max(0, Math.min(4, target)));
    };
    window.addEventListener("oneground:eval-goto", handler);
    return () => window.removeEventListener("oneground:eval-goto", handler);
  }, []);

  const fields = useMemo(() => listFields(records), [records]);
  const questions = useMemo(() => buildQuestions(drafts), [drafts]);
  const questionIds = useMemo(() => drafts.map((d) => d.id), [drafts]);

  const serverDefaultIds = useMemo(() => {
    if (!settings) return [];
    const stored = settings.preferences.profileIds ?? [];
    const valid = stored.filter((id) =>
      systemProfiles.some((profile) => profile.id === id),
    );
    if (valid.length > 0) return valid.slice(0, MAX_MODELS);
    if (settings.preferences.defaultProfileId)
      return [settings.preferences.defaultProfileId];
    return systemProfiles.slice(0, 1).map((profile) => profile.id);
  }, [settings, systemProfiles]);
  const selectedIds = overrideIds ?? serverDefaultIds;

  const selectedProfiles = useMemo(
    () =>
      selectedIds
        .map((id) => systemProfiles.find((profile) => profile.id === id))
        .filter((profile): profile is ModelProfile => Boolean(profile)),
    [selectedIds, systemProfiles],
  );

  const steps = [
    evalDict.stepQuestions,
    evalDict.stepDataset,
    evalDict.stepPreview,
    evalDict.stepMatching,
    evalDict.stepRun,
  ];
  const datasetDone = records.length > 0;
  const questionsDone = validateDrafts(drafts) === null;
  const mappedCount = Object.values(expectedMap).filter(Boolean).length;
  const mappingDone = datasetDone && questionsDone && mappedCount > 0;

  function goTo(target: number) {
    if (target > 0) {
      const validationError = validateDrafts(drafts);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }
    if (target > 1 && !datasetDone) {
      toast.error(evalDict.needDataset);
      return;
    }
    if (target > 3 && mappedCount === 0) {
      toast.error(evalDict.needMapping);
      return;
    }
    setStep(Math.max(0, Math.min(4, target)));
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setParseError("");
    if (EXCEL_PATTERN.test(file.name)) {
      setDataFormat("xlsx");
      setRawText("");
      setExcelRows(null);
      setExcelSheet("");
      void file.arrayBuffer().then(async (buffer) => {
        try {
          // Dynamic import keeps the xlsx chunk off the initial page load.
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
          const sheetName = workbook.SheetNames[0] ?? "";
          if (!sheetName) throw new Error("Workbook has no sheets.");
          const rows = XLSX.utils.sheet_to_json<unknown[]>(
            workbook.Sheets[sheetName],
            { header: 1, defval: "", blankrows: false },
          ) as unknown as unknown[][];
          setExcelRows(rows);
          setExcelSheet(sheetName);
        } catch (error) {
          setExcelRows(null);
          setParseError(error instanceof Error ? error.message : String(error));
        }
      });
      return;
    }
    setExcelRows(null);
    setExcelSheet("");
    void file.text().then((text) => {
      setRawText(text);
      setDataFormat(detectFormat(file.name, text));
    });
  }

  function parseAndContinue() {
    try {
      if (dataFormat === "xlsx" && !excelRows)
        throw new Error(evalDict.excelNotReady);
      const parsed =
        dataFormat === "xlsx"
          ? rowsToRecords(excelRows ?? [])
          : parseDataset(rawText, dataFormat);
      if (parsed.length > PARSE_MAX)
        throw new Error(
          format(evalDict.tooMany, { count: parsed.length, max: PARSE_MAX }),
        );
      setRecords(parsed);
      setParseError("");
      const nextFields = listFields(parsed);
      if (!nextFields.includes(stateField)) {
        const guess =
          nextFields.find((field) =>
            ["text", "state", "message", "content", "input"].includes(field),
          ) ?? "";
        setStateField(guess);
      }
      setExpectedMap((prev) => {
        const next: Record<string, string> = {};
        for (const draft of drafts) {
          if (prev[draft.id] && nextFields.includes(prev[draft.id])) {
            next[draft.id] = prev[draft.id];
          } else if (nextFields.includes(draft.id)) {
            next[draft.id] = draft.id;
          } else {
            next[draft.id] = "";
          }
        }
        return next;
      });
      if (!nextFields.includes(idField)) {
        setIdField(nextFields.includes("id") ? "id" : "");
      }
      setStep(2);
      toast.success(format(evalDict.parsed, { count: parsed.length }));
    } catch (error) {
      setRecords([]);
      setParseError(error instanceof Error ? error.message : String(error));
    }
  }

  function remapExpected(nextDrafts: QuestionDraft[], fieldList: string[]) {
    setExpectedMap((prev) => {
      const next: Record<string, string> = {};
      for (const draft of nextDrafts) {
        if (prev[draft.id] && fieldList.includes(prev[draft.id])) {
          next[draft.id] = prev[draft.id];
        } else if (fieldList.includes(draft.id)) {
          next[draft.id] = draft.id;
        } else {
          next[draft.id] = "";
        }
      }
      return next;
    });
  }

  function handleLoadQProfile(loaded: QuestionDraft[]) {
    const clones = loaded.map((draft) => ({ ...draft }));
    setDrafts(clones);
    remapExpected(clones, fields);
  }

  function addDraft(kind: QuestionDraft["kind"]) {
    setDrafts((prev) => {
      const id = nextQuestionId(prev);
      if (kind === "noul")
        return [...prev, { id, kind, instructions: "", trueCriteria: "", falseCriteria: "" }];
      if (kind === "choice")
        return [
          ...prev,
          {
            id,
            kind,
            instructions: "",
            options: [
              { key: "option_a", description: "" },
              { key: "option_b", description: "" },
            ],
          },
        ];
      return [...prev, { id, kind, instructions: "", levels: ["", ""] }];
    });
  }

  function toggleProfile(id: string, checked: boolean) {
    const prev = selectedIds;
    const next = checked ? [...prev, id] : prev.filter((value) => value !== id);
    if (next.length > MAX_MODELS) {
      toast.error(format(dict.model.limit, { max: MAX_MODELS }));
      return;
    }
    setOverrideIds(next);
  }

  function prepareRows(): PreparedRow[] {
    return records.slice(0, RUN_ROWS).map((record, index) => {
      const rowId = idField
        ? String(getField(record, idField) ?? index + 1)
        : String(index + 1);
      const stateSource = stateField ? getField(record, stateField) : record;
      const state = toStateValue(stateSource ?? record) as JsonStructure;
      const expected: Record<string, string | number | boolean> = {};
      for (const draft of drafts) {
        const mapped = expectedMap[draft.id];
        if (!mapped) continue;
        const value = getField(record, mapped);
        if (value === undefined || value === null || value === "") continue;
        expected[draft.id] = normalizeLabel(value);
      }
      return { rowId, state, preview: previewState(state, 120), expected };
    });
  }

  async function evaluateOne(
    state: JsonStructure,
    questionsMap: QuestionsMap,
    profileId: string,
  ): Promise<EvaluateResponse> {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state, profileId, questions: questionsMap }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data as EvaluateResponse;
  }

  async function run() {
    const validationError = validateDrafts(drafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (records.length === 0) {
      toast.error(evalDict.needDataset);
      return;
    }
    if (selectedProfiles.length === 0) {
      toast.error(dict.toasts.pickModel);
      return;
    }
    if (mappedCount === 0) {
      toast.error(evalDict.needMapping);
      return;
    }
    let prepared: PreparedRow[];
    try {
      prepared = prepareRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return;
    }
    cancelRef.current = false;
    setRunning(true);
    setModelRuns(
      selectedProfiles.map((profile) => ({
        profileId: profile.id,
        label: `${profile.name} · ${profile.model}`,
        model: profile.model,
        rows: [],
        latencies: [],
        done: 0,
        summary: null,
      })),
    );
    setActiveModel(selectedProfiles[0]?.id ?? "");
    try {
      await Promise.all(
        selectedProfiles.map((profile) =>
          runProfile(profile, prepared, questions, questionIds),
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  async function runProfile(
    profile: ModelProfile,
    prepared: PreparedRow[],
    questionsMap: QuestionsMap,
    ids: string[],
  ) {
    let cursor = 0;
    const collected: EvalRowResult[] = new Array(prepared.length);
    const latencies: number[] = [];
    const worker = async () => {
      for (;;) {
        if (cancelRef.current) return;
        const index = cursor++;
        if (index >= prepared.length) return;
        const row = prepared[index];
        const started = performance.now();
        try {
          const response = await evaluateOne(row.state, questionsMap, profile.id);
          const latency = Math.round(performance.now() - started);
          latencies.push(latency);
          collected[index] = scoreRow(
            row.rowId,
            row.preview,
            row.expected,
            response.answers,
            ids,
            null,
            response.latencyMs ?? latency,
          );
        } catch (error) {
          collected[index] = scoreRow(
            row.rowId,
            row.preview,
            row.expected,
            null,
            ids,
            error instanceof Error ? error.message : String(error),
          );
        }
        setModelRuns((prev) =>
          prev.map((entry) =>
            entry.profileId === profile.id
              ? {
                  ...entry,
                  rows: collected.filter(Boolean),
                  latencies: [...latencies],
                  done: collected.filter(Boolean).length,
                  summary: summarizeModel(
                    profile.id,
                    `${profile.name} · ${profile.model}`,
                    collected.filter(Boolean),
                    ids,
                    [...latencies],
                  ),
                }
              : entry,
          ),
        );
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, prepared.length) }, worker),
    );
  }

  function downloadSample(format: EvalFormat) {
    if (format === "xlsx") {
      void downloadSampleXlsx();
      return;
    }
    const records = buildSampleRecords(drafts.map((draft) => draft.id));
    const blob = new Blob([serializeSample(records, format)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sampleFileName(format);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadSampleXlsx() {
    // Dynamic import keeps the xlsx chunk off the initial page load.
    const XLSX = await import("xlsx");
    const records = buildSampleRecords(drafts.map((draft) => draft.id));
    const sheet = XLSX.utils.aoa_to_sheet(sampleSheetRows(records));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "dataset");
    XLSX.writeFile(book, sampleFileName("xlsx"));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(modelRuns, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${datasetName || "eval"}.results.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (modelRuns.length === 0) return;
    const ids = modelRuns[0]
      ? Array.from(
          new Set(modelRuns.flatMap((run) => run.rows.flatMap((row) => Object.keys(row.expected)))),
        )
      : [];
    const header = ["row_id", "state", "model", ...ids.flatMap((id) => [`expected_${id}`, `predicted_${id}`, `correct_${id}`]), "error"];
    const lines = [header.join(",")];
    const escape = (value: unknown) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    for (const run of modelRuns) {
      for (const row of run.rows) {
        lines.push(
          [
            row.rowId,
            row.statePreview,
            run.label,
            ...ids.flatMap((id) => [row.expected[id] ?? "", row.predicted[id] ?? "", row.correct[id] ?? ""]),
            row.error ?? "",
          ]
            .map(escape)
            .join(","),
        );
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${datasetName || "eval"}.results.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const activeRun = modelRuns.find((run) => run.profileId === activeModel) ?? modelRuns[0];
  const previewRows = records.slice(0, PREVIEW_ROWS);
  const previewColumns = fields;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{evalDict.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{evalDict.subtitle}</p>
      </div>

      <nav aria-label={evalDict.title} data-tour="eval-stepper" className="flex items-center gap-1 sm:gap-2">
        {steps.map((label, index) => {
          const done =
            index === 0
              ? questionsDone
              : index <= 2
                ? datasetDone
                : index === 3
                  ? mappingDone
                  : modelRuns.length > 0;
          const current = index === step;
          return (
            <div key={label} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => goTo(index)}
                aria-current={current ? "step" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs transition-colors sm:px-3 sm:text-sm ${
                  current
                    ? "border-primary bg-primary/5 font-medium"
                    : "hover:border-primary/50"
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : current
                        ? "border-primary text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="truncate">{label}</span>
              </button>
              {index < steps.length - 1 && (
                <span aria-hidden className="h-px w-3 shrink-0 bg-border sm:w-6" />
              )}
            </div>
          );
        })}
      </nav>
      <p className="font-mono text-xs text-muted-foreground">
        {format(evalDict.stepOf, { current: step + 1, total: steps.length })}
      </p>

      {step === 0 && (
      <Card data-tour="eval-questions">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{evalDict.qprofileTitle}</CardTitle>
              <CardDescription className="mt-1.5">
                {evalDict.qprofileDescription}
              </CardDescription>
            </div>
            <QuestionProfileButtons
              drafts={drafts}
              onLoad={(loaded) => handleLoadQProfile(loaded)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {drafts.map((draft, index) => (
            <div key={index} className="space-y-3 rounded-lg border p-4">
              <QuestionEditor
                draft={draft}
                onChange={(next) => {
                  const previousId = drafts[index].id;
                  setDrafts((prev) => prev.map((d, i) => (i === index ? next : d)));
                  if (next.id !== previousId) {
                    setExpectedMap((prev) => {
                      const mapped = prev[previousId] ?? "";
                      const nextMap = { ...prev };
                      delete nextMap[previousId];
                      nextMap[next.id] = mapped;
                      return nextMap;
                    });
                  }
                }}
                onRemove={() => {
                  const removed = drafts[index].id;
                  setDrafts((prev) => prev.filter((_, i) => i !== index));
                  setExpectedMap((prev) => {
                    const next = { ...prev };
                    delete next[removed];
                    return next;
                  });
                }}
              />
            </div>
          ))}
          {drafts.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {dict.questions.empty}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addDraft("noul")}>
              <Plus className="size-3" /> noul
            </Button>
            <Button variant="outline" size="sm" onClick={() => addDraft("choice")}>
              <Plus className="size-3" /> choice
            </Button>
            <Button variant="outline" size="sm" onClick={() => addDraft("score")}>
              <Plus className="size-3" /> score
            </Button>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button size="sm" onClick={() => goTo(1)}>
              {evalDict.continue} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {step === 1 && (
      <Card data-tour="eval-dataset">
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle>{evalDict.datasetTitle}</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={evalDict.valuesInfoTitle}
                >
                  <Info className="size-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 space-y-2">
                <p className="text-sm font-medium">{evalDict.valuesInfoTitle}</p>
                <p className="text-xs text-muted-foreground">{evalDict.valuesInfoCols}</p>
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  <li>{evalDict.valuesInfoNoul}</li>
                  <li>{evalDict.valuesInfoChoice}</li>
                  <li>{evalDict.valuesInfoScore}</li>
                </ul>
                <p className="text-xs text-muted-foreground">{evalDict.valuesInfoBlank}</p>
              </PopoverContent>
            </Popover>
          </div>
          <CardDescription>{evalDict.datasetDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="eval-dataset-name">{evalDict.datasetName}</Label>
            <Input
              id="eval-dataset-name"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="Urgency sample"
            />
          </div>
          <Tabs value={datasetTab} onValueChange={setDatasetTab}>
            <TabsList>
              <TabsTrigger value="file">{evalDict.fileUpload}</TabsTrigger>
              <TabsTrigger value="manual">{evalDict.manualInput}</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="space-y-2">
              <div
                role="button"
                tabIndex={0}
                aria-label={evalDict.upload}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "hover:border-primary/50"
                }`}
              >
                <Upload className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">{evalDict.dropTitle}</p>
                <p className="text-xs text-muted-foreground">{evalDict.dropHint}</p>
                {fileName && (
                  <span className="font-mono text-xs text-muted-foreground">{fileName}</span>
                )}
                {dataFormat === "xlsx" && fileName && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {excelRows
                      ? format(evalDict.excelLoaded, {
                          sheet: excelSheet,
                          count: Math.max(excelRows.length - 1, 0),
                        })
                      : evalDict.excelLoading}
                  </span>
                )}
              </div>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".json,.jsonl,.ndjson,.csv,.tsv,.tab,.xml,.txt,.xls,.xlsx,.xlsm,.xlsb"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
                className="hidden"
                aria-label={evalDict.upload}
              />
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">{evalDict.samplesLabel}</span>
                {(
                  [
                    { label: "XLSX", format: "xlsx" },
                    { label: "CSV", format: "csv" },
                    { label: "TSV", format: "tsv" },
                    { label: "JSON", format: "json" },
                    { label: "JSONL", format: "jsonl" },
                    { label: "XML", format: "xml" },
                  ] as { label: string; format: EvalFormat }[]
                ).map((sample) => (
                  <Button
                    key={sample.label}
                    variant="outline"
                    size="sm"
                    className="h-7 font-mono text-xs"
                    onClick={() => downloadSample(sample.format)}
                  >
                    <Download className="size-3 text-muted-foreground" />
                    {sample.label}
                  </Button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="manual" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="eval-dataset-format">{evalDict.format}</Label>
                <Select value={dataFormat} onValueChange={(value) => setDataFormat(value as EvalFormat)}>
                  <SelectTrigger id="eval-dataset-format" className="w-36" aria-label={evalDict.format}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="jsonl">JSONL</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="tsv">TSV</SelectItem>
                    <SelectItem value="xml">XML</SelectItem>
                    <SelectItem value="xlsx">Excel (.xls/.xlsx)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dataFormat === "xlsx" && (
                <p className="text-xs text-muted-foreground">{evalDict.excelHint}</p>
              )}
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
                className="h-64 max-h-64 overflow-y-auto font-mono text-xs [field-sizing:fixed]"
                placeholder={evalDict.datasetPlaceholder}
              />
            </TabsContent>
          </Tabs>
          {parseError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {parseError}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => goTo(0)}>
                <ArrowLeft className="size-3.5" /> {evalDict.back}
              </Button>
              {records.length > 0 && (
                <Badge variant="outline" className="font-mono text-xs">
                  {format(evalDict.rowsCount, { count: records.length })}
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              onClick={parseAndContinue}
              disabled={dataFormat === "xlsx" ? !excelRows : !rawText.trim()}
            >
              {evalDict.continue} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {step === 2 && (
      <Card data-tour="eval-preview">
        <CardHeader>
          <CardTitle>{evalDict.previewTitle}</CardTitle>
          <CardDescription>
            {format(evalDict.previewDescription, {
              shown: previewRows.length,
              count: records.length,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {format(evalDict.rowsCount, { count: records.length })}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {dataFormat.toUpperCase()}
            </Badge>
            {records.length > RUN_ROWS && (
              <span className="text-xs text-muted-foreground">
                {format(evalDict.trimmed, { max: RUN_ROWS })}
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  {previewColumns.map((field) => (
                    <th key={field} className="px-3 py-2 text-left font-mono font-medium">
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((record, index) => (
                  <tr key={index} className="border-b align-top last:border-b-0">
                    {previewColumns.map((field) => (
                      <td key={field} className="max-w-56 truncate px-3 py-2 font-mono" title={String(getField(record, field) ?? "")}>
                        {String(
                          typeof getField(record, field) === "object"
                            ? JSON.stringify(getField(record, field))
                            : (getField(record, field) ?? "—"),
                        ).slice(0, 80)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => goTo(1)}>
              <ArrowLeft className="size-3.5" /> {evalDict.back}
            </Button>
            <Button size="sm" onClick={() => goTo(3)}>
              {evalDict.continue} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {step === 3 && (
      <Card data-tour="eval-matching">
        <CardHeader>
          <CardTitle>{evalDict.mappingTitle}</CardTitle>
          <CardDescription>{evalDict.mappingDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{evalDict.stateField}</Label>
              <Select
                value={stateField || "__entire__"}
                onValueChange={(value) => setStateField(value === "__entire__" ? "" : value)}
              >
                <SelectTrigger className="w-full" aria-label={evalDict.stateField}>
                  <SelectValue placeholder={evalDict.entireRecord} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__entire__">{evalDict.entireRecord}</SelectItem>
                  {fields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{evalDict.stateHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{evalDict.idField}</Label>
              <Select
                value={idField || "__none__"}
                onValueChange={(value) => setIdField(value === "__none__" ? "" : value)}
              >
                <SelectTrigger className="w-full" aria-label={evalDict.idField}>
                  <SelectValue placeholder={evalDict.rowNumber} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{evalDict.rowNumber}</SelectItem>
                  {fields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {questionIds.map((id) => (
            <div key={id} className="space-y-1.5 rounded-lg border p-4">
              <Label>{format(evalDict.expectedField, { id })}</Label>
              <Select
                value={expectedMap[id] || "__none__"}
                onValueChange={(value) =>
                  setExpectedMap((prev) => ({
                    ...prev,
                    [id]: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="w-full" aria-label={format(evalDict.expectedField, { id })}>
                  <SelectValue placeholder={evalDict.noLabel} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{evalDict.noLabel}</SelectItem>
                  {fields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => goTo(2)}>
              <ArrowLeft className="size-3.5" /> {evalDict.back}
            </Button>
            <Button size="sm" onClick={() => goTo(4)}>
              {evalDict.continue} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {step === 4 && (
      <Card data-tour="eval-run">
        <CardHeader>
          <CardTitle>{evalDict.runTitle}</CardTitle>
          <CardDescription>{evalDict.runDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!settings || running} className="h-9 justify-between gap-2 px-3 font-mono text-xs">
                  <span className="truncate">
                    {selectedProfiles.length === 0
                      ? dict.model.none
                      : format(dict.model.many, { count: selectedProfiles.length })}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {systemProfiles.map((profile) => (
                  <DropdownMenuCheckboxItem
                    key={profile.id}
                    checked={selectedIds.includes(profile.id)}
                    onCheckedChange={(value) => toggleProfile(profile.id, value === true)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{profile.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {profile.model}
                      </span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => void run()} disabled={running || selectedProfiles.length === 0}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {dict.actions.run}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                cancelRef.current = true;
              }}
              disabled={!running}
            >
              {evalDict.stop}
            </Button>
          </div>

          {modelRuns.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{datasetName || "dataset"}</span>
              {" · "}
              {format(evalDict.resultsMeta, {
                shown: Math.min(records.length, RUN_ROWS),
                total: records.length,
                models: modelRuns.length,
              })}
            </p>
          )}

          {modelRuns.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {modelRuns.map((run) => (
                <Card key={run.profileId} size="sm">
                  <CardContent className="space-y-1 pt-4">
                    <p className="truncate font-mono text-xs font-medium" title={run.label}>
                      {run.label}
                    </p>
                    <p className="text-2xl font-semibold">
                      {formatPercent(run.summary?.accuracy ?? null)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(evalDict.correctOf, {
                        correct: run.summary?.correct ?? 0,
                        labeled: run.summary?.labeled ?? 0,
                      })}
                      {run.summary && run.summary.errors > 0 &&
                        ` · ${format(evalDict.failedCount, { count: run.summary.errors })}`}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {format(evalDict.progress, { done: run.done, total: Math.min(records.length, RUN_ROWS) })}
                      {run.summary?.avgLatencyMs !== null && run.summary?.avgLatencyMs !== undefined
                        ? ` · ${run.summary.avgLatencyMs} ms`
                        : ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {modelRuns.length > 0 && (
            <Tabs value={activeRun?.profileId} onValueChange={setActiveModel}>
              <TabsList>
                {modelRuns.map((run) => (
                  <TabsTrigger key={run.profileId} value={run.profileId} className="font-mono text-xs">
                    {run.label.slice(0, 24)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {modelRuns.map((run) => (
                <TabsContent key={run.profileId} value={run.profileId} className="mt-4">
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium">row</th>
                          <th className="px-3 py-2 text-left font-medium">{dict.bulk.stateColumn}</th>
                          {questionIds.map((id) => (
                            <th key={id} className="px-3 py-2 text-left font-mono font-medium">
                              {id}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left font-medium">{dict.compare.status}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.rows.map((row) => (
                          <tr key={row.rowId} className="border-b align-top last:border-b-0">
                            <td className="whitespace-nowrap px-3 py-2 font-mono">{row.rowId}</td>
                            <td className="max-w-56 truncate px-3 py-2 font-mono" title={row.statePreview}>
                              {row.statePreview}
                            </td>
                            {questionIds.map((id) => {
                              const predicted = row.predicted[id];
                              const expected = row.expected[id];
                              const correct = row.correct[id];
                              return (
                                <td key={id} className="px-3 py-2">
                                  {predicted === null || predicted === undefined ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (
                                    <span className="flex items-center gap-1.5">
                                      <span className="font-mono" title={`${evalDict.expected}: ${String(expected ?? "—")} / ${evalDict.predicted}: ${String(predicted)}`}>
                                        {String(predicted)}
                                      </span>
                                      {correct !== null && correct !== undefined && (
                                        <Badge variant={correct ? "secondary" : "destructive"} className="text-[10px]">
                                          {correct ? "✓" : "✗"}
                                        </Badge>
                                      )}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2">
                              {row.error ? (
                                <span className="text-red-600 dark:text-red-400" title={row.error}>
                                  {dict.bulk.rowFailed}
                                </span>
                              ) : (
                                <span>{dict.compare.done}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}

          {modelRuns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={exportJson}>
                <Download className="size-3.5" /> JSON
              </Button>
              <Button variant="ghost" size="sm" onClick={exportCsv}>
                <Download className="size-3.5" /> CSV
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => goTo(3)} disabled={running}>
              <ArrowLeft className="size-3.5" /> {evalDict.back}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
