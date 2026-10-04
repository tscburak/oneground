"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuestionEditor } from "@/components/playground/question-editor";
import { Playground } from "@/components/playground/playground";
import { AdvancedAnalysis } from "./advanced-analysis";
import { SchemaPreview } from "./schema-preview";
import { GuidedTour, type TourSection } from "@/components/guided-tour";
import { ModelSettingsDialog } from "@/components/model-settings-dialog";
import { useModelSettings } from "@/components/model-settings-provider";
import { evaluatorProfile } from "@/lib/model-settings-types";
import {
  buildQuestions,
  nextQuestionId,
  validateDrafts,
  type QuestionDraft,
} from "@/lib/typesafe";
import { parseDataset, mapRows } from "@/lib/lab/import";
import { analyze } from "@/lib/lab/metrics";
import {
  DEFAULT_POLICY,
  ABSTAIN,
  type Dataset,
  type DatasetRow,
  type Evaluator,
  type Policy,
  type Run,
  type RunSummary,
  type Schema,
} from "@/lib/lab/types";

async function api(body?: unknown, runId?: string) {
  const response = await fetch(
    `/api/lab${runId ? `?run=${encodeURIComponent(runId)}` : ""}`,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      {
        type:
          typeof value === "string"
            ? "text/csv;charset=utf-8"
            : "application/json",
      },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function Field({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{title}</span>
      {children}
    </label>
  );
}
function Select({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}
function Panel({
  title,
  children,
  tour,
}: {
  title: string;
  children: React.ReactNode;
  tour?: string;
}) {
  return (
    <Card data-tour={tour}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const initialDraft: QuestionDraft = {
  id: "urgent",
  kind: "noul",
  instructions: "Does the message require urgent attention?",
  trueCriteria: "Explicit urgency or immediate action required.",
  falseCriteria: "No urgency.",
};
const demo = JSON.stringify(
  [
    {
      id: "1",
      state: "Urgent: payment failed, fix it now",
      expected: { urgent: true },
      split: "validation",
      segment: "billing",
    },
    {
      id: "2",
      state: "What are your opening hours?",
      expected: { urgent: false },
      split: "validation",
      segment: "general",
    },
    {
      id: "3",
      state: "Please help immediately with my account",
      expected: { urgent: true },
      split: "validation",
      segment: "general",
    },
    {
      id: "4",
      state: "Thanks for your help",
      expected: { urgent: false },
      split: "test",
      segment: "general",
    },
    {
      id: "5",
      state: "Urgent: charged twice",
      expected: { urgent: true },
      split: "test",
      segment: "billing",
    },
  ],
  null,
  2,
);
function newEvaluator(kind: Evaluator["kind"]): Evaluator {
  return {
    id: crypto.randomUUID(),
    name:
      kind === "rules"
        ? "Rules baseline"
        : kind === "llm"
          ? "LLM"
          : kind === "cascade"
            ? "Decision cascade"
            : "System One",
    kind,
    model:
      kind === "system-one"
        ? "jev-latest"
        : kind === "llm"
          ? ""
          : kind === "cascade"
            ? "cascade-v1"
            : "rules-v1",
    baseUrl:
      kind === "system-one"
        ? "https://api.typesafe.ai"
        : kind === "llm"
          ? "https://api.openai.com/v1"
          : "",
    prompt: "Apply the question definitions consistently.",
    rules: [
      {
        question: "urgent",
        path: "",
        operator: "contains",
        value: "urgent",
        output: true,
      },
    ],
    defaults: { urgent: false },
    inputPrice: null,
    outputPrice: null,
    stages: [],
    fallbackConfidence: 0.7,
  };
}

export function Workspace() {
  const { lang } = useParams();
  const tr = lang === "tr";
  const { settings: modelSettings, mutate: changeModelSettings } =
    useModelSettings();
  const [area, setArea] = useState("playground");
  const [labSection, setLabSection] = useState<TourSection>("dataset");
  const tourSection = area === "playground" ? "playground" : labSection;
  const t = (turkish: string, english: string) => (tr ? turkish : english);
  const [datasets, setDatasets] = useState<Dataset[]>([]),
    [schemas, setSchemas] = useState<Schema[]>([]),
    [runs, setRuns] = useState<RunSummary[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [datasetId, setDatasetId] = useState(""),
    [schemaId, setSchemaId] = useState(""),
    [runId, setRunId] = useState(""),
    [run, setRun] = useState<Run | null>(null);
  const [drafts, setDrafts] = useState<QuestionDraft[]>([initialDraft]),
    [schemaName, setSchemaName] = useState("Urgency v1"),
    [schemaJson, setSchemaJson] = useState("");
  const [text, setText] = useState(demo),
    [format, setFormat] = useState<"json" | "csv" | "jsonl">("json"),
    [datasetName, setDatasetName] = useState("Urgency sample"),
    [mapping, setMapping] = useState({
      id: "id",
      state: "state",
      split: "split",
      segment: "segment",
      labels: '{"urgent":"expected.urgent"}',
    });
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]),
    [runName, setRunName] = useState("Experiment 1");
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY),
    [questionId, setQuestionId] = useState("urgent"),
    [evaluatorId, setEvaluatorId] = useState(""),
    [split, setSplit] = useState("all"),
    [segment, setSegment] = useState("");
  const [filter, setFilter] = useState("all"),
    [cell, setCell] = useState<{ truth: string; prediction: string } | null>(
      null,
    ),
    [replayScope, setReplayScope] = useState("all");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [rowPage, setRowPage] = useState(0);
  async function refresh() {
    const data = await api();
    setDatasets(data.datasets);
    setSchemas(data.schemas);
    setRuns(data.runs);
  }
  useEffect(() => {
    let alive = true;
    const refreshList = async () => {
      try {
        const data = await api();
        if (alive) {
          setDatasets(data.datasets);
          setSchemas(data.schemas);
          setRuns(data.runs);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void refreshList();
    const timer = setInterval(refreshList, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    const poll = async () => {
      try {
        const data: Run = await api(undefined, runId);
        if (alive) setRun(data);
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void poll();
    const timer = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [runId]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function openRun(value: Run) {
    setRunId(value.id);
    setRun(value);
    setPolicy(value.policy);
    setQuestionId(Object.keys(value.schema.questions)[0]);
    setEvaluatorId(value.evaluators[0].id);
    setCell(null);
    setSelectedRows([]);
    setRowPage(0);
    setSplit("all");
    setSegment("");
  }
  const preview = useMemo(() => {
    try {
      const records = parseDataset(text, format);
      const labels = JSON.parse(mapping.labels);
      if (
        !labels ||
        typeof labels !== "object" ||
        Array.isArray(labels) ||
        Object.values(labels).some((v) => typeof v !== "string")
      )
        throw new Error("Label mapping must be an object of field paths.");
      return { rows: mapRows(records, { ...mapping, labels }), error: "" };
    } catch (e) {
      return {
        rows: [] as DatasetRow[],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [text, format, mapping]);
  const activeEvaluator = run?.evaluators.some((e) => e.id === evaluatorId)
    ? evaluatorId
    : run?.evaluators[0]?.id;
  const activeQuestion = run?.schema.questions[questionId]
    ? questionId
    : run
      ? Object.keys(run.schema.questions)[0]
      : "";
  const stats =
    run && activeEvaluator && activeQuestion
      ? analyze(run, activeEvaluator, activeQuestion, policy, split, segment)
      : null;
  const compare =
    run && activeQuestion
      ? run.evaluators.map((e) => ({
          evaluator: e,
          stats: analyze(run, e.id, activeQuestion, policy, split, segment),
        }))
      : [];
  const disagreement = new Set<string>();
  const predictionMaps = compare.map(
    (c) => new Map(c.stats.samples.map((s) => [s.row.id, s.prediction])),
  );
  if (compare.length > 1)
    for (const sample of compare[0].stats.samples) {
      const predictions = predictionMaps
        .map((map) => map.get(sample.row.id))
        .filter((p) => p !== undefined);
      if (new Set(predictions).size > 1) disagreement.add(sample.row.id);
    }
  const visible =
    stats?.samples.filter(
      (s) =>
        (!cell ||
          (s.truth === cell.truth && s.prediction === cell.prediction)) &&
        (filter === "all" ||
          (filter === "wrong" && s.correct === false) ||
          (filter === "errors" && s.item?.status === "error") ||
          (filter === "review" && s.prediction === ABSTAIN) ||
          (filter === "disagreement" && disagreement.has(s.row.id))),
    ) ?? [];
  const selectedSchema = schemas.find((s) => s.id === schemaId);
  const maxPage = Math.max(0, Math.ceil(visible.length / 100) - 1),
    currentPage = Math.min(rowPage, maxPage);
  const updateEvaluator = (id: string, change: Partial<Evaluator>) =>
    setEvaluators((values) =>
      values.map((e) => (e.id === id ? { ...e, ...change } : e)),
    );
  return (
    <div>
      <Tabs value={area} onValueChange={setArea} className="w-full min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
          <div>
            <p className="font-bold tracking-tight">OneGround</p>
            <p className="text-xs text-muted-foreground">
              {t(
                "Karar değerlendirme çalışma alanı",
                "Decision evaluation workspace",
              )}
            </p>
          </div>
          <TabsList>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="lab">Evaluation lab</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <ModelSettingsDialog />
            <GuidedTour
              key={`${tourSection}-${lang}`}
              section={tourSection}
              tr={tr}
            />
          </div>
        </div>
        <TabsContent value="playground">
          <Playground />
        </TabsContent>
        <TabsContent value="lab" className="workspace-panel space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t(
                "Kararları ölç, karşılaştır, tekrar oynat.",
                "Measure, compare, replay decisions.",
              )}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {t(
                "Dataset ve şema sürümleriyle tekrarlanabilir deneyler. Eşik değişiklikleri yeni inference gerektirmez.",
                "Reproducible experiments with dataset and schema snapshots. Tune thresholds without new inference.",
              )}
            </p>
          </div>
          {error && (
            <div
              role="alert"
              className="whitespace-pre-wrap rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </div>
          )}
          <Tabs
            value={labSection}
            onValueChange={(value) => setLabSection(value as TourSection)}
          >
            <TabsList data-tour="lab-tabs" className="h-auto flex-wrap">
              <TabsTrigger value="dataset">Dataset</TabsTrigger>
              <TabsTrigger value="schema">
                {t("Karar şeması", "Decision schema")}
              </TabsTrigger>
              <TabsTrigger value="experiment">
                {t("Deney oluştur", "New experiment")}
              </TabsTrigger>
              <TabsTrigger value="results">
                {t("Analiz & replay", "Analysis & replay")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="dataset" className="space-y-4 pt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel
                  tour="dataset-import"
                  title={t("Dataset yükle", "Import dataset")}
                >
                  <Field title={t("Dataset adı", "Dataset name")}>
                    <Input
                      value={datasetName}
                      onChange={(e) => setDatasetName(e.target.value)}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field title={t("Format", "Format")}>
                      <Select
                        label="Format"
                        value={format}
                        onChange={(v) => setFormat(v as typeof format)}
                      >
                        <option>json</option>
                        <option>jsonl</option>
                        <option>csv</option>
                      </Select>
                    </Field>
                    <Field title={t("Dosya", "File")}>
                      <Input
                        type="file"
                        accept=".csv,.json,.jsonl"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file)
                            void action(async () => {
                              if (file.size > 10_000_000)
                                throw new Error("Maximum file size is 10 MB.");
                              setText(await file.text());
                              setDatasetName(file.name);
                              setFormat(
                                file.name.endsWith(".csv")
                                  ? "csv"
                                  : file.name.endsWith(".jsonl")
                                    ? "jsonl"
                                    : "json",
                              );
                            });
                        }}
                      />
                    </Field>
                  </div>
                  <Field title={t("Veri / önizleme", "Data / preview")}>
                    <Textarea
                      className="min-h-64 font-mono text-xs"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </Field>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setText(demo);
                      setFormat("json");
                      setMapping({
                        id: "id",
                        state: "state",
                        split: "split",
                        segment: "segment",
                        labels: '{"urgent":"expected.urgent"}',
                      });
                    }}
                  >
                    {t("Örnek veriyi yükle", "Load sample")}
                  </Button>
                </Panel>
                <Panel
                  tour="dataset-mapping"
                  title={t("Alan eşleme", "Field mapping")}
                >
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "İç içe alanlar için noktalı yol kullanın. Boş state yolu tüm kaydı gönderir. Boş split yolu validation kullanır.",
                      "Use dotted paths for nested fields. Empty state path sends the whole record; empty split defaults to validation.",
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(["id", "state", "split", "segment"] as const).map(
                      (key) => (
                        <Field key={key} title={key}>
                          <Input
                            value={mapping[key]}
                            onChange={(e) =>
                              setMapping({ ...mapping, [key]: e.target.value })
                            }
                          />
                        </Field>
                      ),
                    )}
                  </div>
                  <Field
                    title={t(
                      "Etiket eşleme: soru ID → alan yolu (JSON)",
                      "Labels: question ID → field path (JSON)",
                    )}
                  >
                    <Textarea
                      className="font-mono text-xs"
                      value={mapping.labels}
                      onChange={(e) =>
                        setMapping({ ...mapping, labels: e.target.value })
                      }
                    />
                  </Field>
                  {preview.error ? (
                    <p
                      role="status"
                      className="whitespace-pre-wrap text-sm text-red-600"
                    >
                      {preview.error}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span>
                          {preview.rows.length} {t("kayıt", "rows")}
                        </span>
                        <span>
                          {
                            preview.rows.filter(
                              (r) => Object.keys(r.expected).length,
                            ).length
                          }{" "}
                          {t("etiketli", "labeled")}
                        </span>
                        <span>
                          {
                            preview.rows.filter((r) => r.split === "test")
                              .length
                          }{" "}
                          test
                        </span>
                      </div>
                      <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">
                        {JSON.stringify(preview.rows.slice(0, 3), null, 2)}
                      </pre>
                    </>
                  )}
                  <Button
                    data-tour="dataset-save"
                    disabled={busy || !!preview.error || !preview.rows.length}
                    onClick={() =>
                      void action(async () => {
                        const value = await api({
                          action: "dataset",
                          name: datasetName,
                          rows: preview.rows,
                        });
                        setDatasetId(value.id);
                        toast.success(
                          t(
                            "Dataset sürümü kaydedildi",
                            "Dataset version saved",
                          ),
                        );
                      })
                    }
                  >
                    {t("Dataset sürümünü kaydet", "Save dataset version")}
                  </Button>
                </Panel>
              </div>
              <Panel title={t("Kayıtlı dataset’ler", "Saved datasets")}>
                <div className="grid gap-3 md:grid-cols-3">
                  {datasets.map((d) => (
                    <button
                      className={`rounded-lg border p-4 text-left ${datasetId === d.id ? "border-primary bg-muted" : ""}`}
                      key={d.id}
                      onClick={() => setDatasetId(d.id)}
                    >
                      <strong>{d.name}</strong>
                      <p className="text-xs text-muted-foreground">
                        {d.rows.length} {t("kayıt", "rows")} ·{" "}
                        {new Date(d.createdAt).toLocaleString(
                          tr ? "tr-TR" : "en-US",
                        )}
                      </p>
                    </button>
                  ))}
                </div>
                {!datasets.length && (
                  <p className="text-sm text-muted-foreground">
                    {t("Henüz dataset yok.", "No datasets yet.")}
                  </p>
                )}
              </Panel>
            </TabsContent>
            <TabsContent value="schema" className="space-y-4 pt-4">
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <Panel
                  tour="schema-builder"
                  title={t("Şema oluşturucu", "Schema builder")}
                >
                  <Field title={t("Şema sürüm adı", "Schema version name")}>
                    <Input
                      value={schemaName}
                      onChange={(e) => setSchemaName(e.target.value)}
                    />
                  </Field>
                  {drafts.map((draft, i) => (
                    <QuestionEditor
                      key={i}
                      draft={draft}
                      onChange={(value) =>
                        setDrafts(drafts.map((d, j) => (j === i ? value : d)))
                      }
                      onRemove={() =>
                        setDrafts(drafts.filter((_, j) => j !== i))
                      }
                    />
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {(["noul", "choice", "score"] as const).map((kind) => (
                      <Button
                        key={kind}
                        variant="outline"
                        onClick={() => {
                          const id = nextQuestionId(drafts);
                          setDrafts([
                            ...drafts,
                            kind === "noul"
                              ? { ...initialDraft, id, instructions: "" }
                              : kind === "choice"
                                ? {
                                    id,
                                    kind,
                                    instructions: "",
                                    options: [
                                      { key: "a", description: "" },
                                      { key: "b", description: "" },
                                    ],
                                  }
                                : {
                                    id,
                                    kind,
                                    instructions: "",
                                    levels: ["Low", "High"],
                                  },
                          ]);
                        }}
                      >
                        + {kind}
                      </Button>
                    ))}
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const validation = validateDrafts(drafts);
                          if (validation) throw new Error(validation);
                          const value = await api({
                            action: "schema",
                            name: schemaName,
                            drafts,
                          });
                          setSchemaId(value.id);
                          toast.success(
                            t("Şema sürümü kaydedildi", "Schema version saved"),
                          );
                        })
                      }
                    >
                      {t("Yeni sürüm kaydet", "Save new version")}
                    </Button>
                  </div>
                </Panel>
                <Panel tour="schema-json" title="JSON & versions">
                  <SchemaPreview
                    drafts={drafts}
                    evaluators={evaluators}
                    initialState={
                      datasets.find((d) => d.id === datasetId)?.rows[0]
                        ?.state ?? "Urgent: payment failed"
                    }
                    tr={tr}
                  />
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(buildQuestions(drafts), null, 2)}
                  </pre>
                  <Button
                    variant="outline"
                    onClick={() =>
                      download("decision-schema.json", {
                        name: schemaName,
                        drafts,
                      })
                    }
                  >
                    {t("Şemayı dışa aktar", "Export schema")}
                  </Button>
                  <Field title={t("Şema JSON içe aktar", "Import schema JSON")}>
                    <Textarea
                      value={schemaJson}
                      onChange={(e) => setSchemaJson(e.target.value)}
                      placeholder='{"name":"...","drafts":[...]}'
                      className="font-mono text-xs"
                    />
                  </Field>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const value = JSON.parse(schemaJson);
                        const saved = await api({ ...value, action: "schema" });
                        setDrafts(saved.drafts);
                        setSchemaName(saved.name);
                        setSchemaId(saved.id);
                      })
                    }
                  >
                    {t("Doğrula ve içe aktar", "Validate & import")}
                  </Button>
                  {schemas.map((s) => (
                    <button
                      key={s.id}
                      className="block w-full rounded border p-3 text-left text-sm"
                      onClick={() => {
                        setDrafts(s.drafts);
                        setSchemaName(s.name);
                        setSchemaId(s.id);
                      }}
                    >
                      <strong>{s.name}</strong>
                      <p className="text-xs text-muted-foreground">
                        {s.drafts.length} {t("soru", "questions")} ·{" "}
                        {s.id.slice(0, 8)}
                      </p>
                    </button>
                  ))}
                </Panel>
              </div>
            </TabsContent>
            <TabsContent value="experiment" className="space-y-4 pt-4">
              <Panel
                tour="experiment-config"
                title={t("Deney yapılandırması", "Experiment configuration")}
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <Field title={t("Deney adı", "Experiment name")}>
                    <Input
                      value={runName}
                      onChange={(e) => setRunName(e.target.value)}
                    />
                  </Field>
                  <Field title="Dataset">
                    <Select
                      label="Dataset"
                      value={datasetId}
                      onChange={setDatasetId}
                    >
                      <option value="">{t("Seçin", "Select")}</option>
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {d.rows.length}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field title={t("Şema", "Schema")}>
                    <Select
                      label="Schema"
                      value={schemaId}
                      onChange={setSchemaId}
                    >
                      <option value="">{t("Seçin", "Select")}</option>
                      {schemas.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div
                  data-tour="experiment-add"
                  className="flex flex-wrap gap-2"
                >
                  {(["rules", "system-one", "llm", "cascade"] as const).map(
                    (kind) => (
                      <Button
                        key={kind}
                        variant="outline"
                        disabled={evaluators.length >= 6}
                        onClick={() =>
                          setEvaluators([
                            ...evaluators,
                            {
                              ...newEvaluator(kind),
                              ...(modelSettings?.models.find(
                                (profile) => profile.kind === kind,
                              )
                                ? evaluatorProfile(
                                    modelSettings.models.find(
                                      (profile) => profile.kind === kind,
                                    )!,
                                  )
                                : {}),
                            },
                          ])
                        }
                      >
                        + {kind}
                      </Button>
                    ),
                  )}
                </div>
                {evaluators.map((e) => (
                  <div key={e.id} className="space-y-4 rounded-lg border p-4">
                    {(e.kind === "system-one" || e.kind === "llm") && (
                      <div className="flex flex-wrap items-end gap-2">
                        <Field title={t("Kayıtlı model", "Saved model")}>
                          <Select
                            label={`Saved model ${e.id}`}
                            value={e.profileId ?? ""}
                            onChange={(id) => {
                              const profile = modelSettings?.models.find(
                                (profile) => profile.id === id,
                              );
                              if (profile)
                                updateEvaluator(
                                  e.id,
                                  evaluatorProfile(profile),
                                );
                              else
                                updateEvaluator(e.id, { profileId: undefined });
                            }}
                          >
                            <option value="">
                              {t("Özel yapılandırma", "Custom configuration")}
                            </option>
                            {modelSettings?.models
                              .filter((profile) => profile.kind === e.kind)
                              .map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name} · {profile.model}
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              const data = await changeModelSettings({
                                action: "save-model",
                                id: e.profileId,
                                name: e.name,
                                kind: e.kind,
                                model: e.model,
                                baseUrl: e.baseUrl,
                                prompt: e.prompt,
                                inputPrice: e.inputPrice,
                                outputPrice: e.outputPrice,
                              });
                              updateEvaluator(e.id, {
                                profileId: data.savedProfileId,
                              });
                              toast.success(
                                t(
                                  "Model veritabanına kaydedildi",
                                  "Model saved to database",
                                ),
                              );
                            })
                          }
                        >
                          {t("Modeli DB’ye kaydet", "Save model to DB")}
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <strong>{e.kind}</strong>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setEvaluators(evaluators.filter((v) => v.id !== e.id))
                        }
                      >
                        {t("Kaldır", "Remove")}
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field title={t("Ad", "Name")}>
                        <Input
                          value={e.name}
                          onChange={(event) =>
                            updateEvaluator(e.id, { name: event.target.value })
                          }
                        />
                      </Field>
                      <Field title="Model">
                        <Input
                          value={e.model}
                          onChange={(event) =>
                            updateEvaluator(e.id, { model: event.target.value })
                          }
                        />
                      </Field>
                      {e.kind !== "rules" && e.kind !== "cascade" && (
                        <Field title="Base URL">
                          <Input
                            value={e.baseUrl}
                            onChange={(event) =>
                              updateEvaluator(e.id, {
                                baseUrl: event.target.value,
                              })
                            }
                          />
                        </Field>
                      )}
                    </div>
                    {e.kind === "rules" ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "İlk eşleşen kural uygulanır. Metin state için alan yolunu boş bırakın.",
                            "First matching rule wins. Leave path empty for text state.",
                          )}
                        </p>
                        {e.rules.map((rule, i) => (
                          <div key={i} className="grid gap-2 md:grid-cols-6">
                            <Field title={t("Soru", "Question")}>
                              <Input
                                value={rule.question}
                                onChange={(event) =>
                                  updateEvaluator(e.id, {
                                    rules: e.rules.map((r, j) =>
                                      j === i
                                        ? { ...r, question: event.target.value }
                                        : r,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <Field title={t("Alan yolu", "Field path")}>
                              <Input
                                value={rule.path}
                                onChange={(event) =>
                                  updateEvaluator(e.id, {
                                    rules: e.rules.map((r, j) =>
                                      j === i
                                        ? { ...r, path: event.target.value }
                                        : r,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <Field title={t("Operatör", "Operator")}>
                              <Select
                                label="Rule operator"
                                value={rule.operator}
                                onChange={(v) =>
                                  updateEvaluator(e.id, {
                                    rules: e.rules.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            operator: v as typeof r.operator,
                                          }
                                        : r,
                                    ),
                                  })
                                }
                              >
                                {["contains", "equals", "gt", "regex"].map(
                                  (v) => (
                                    <option key={v}>{v}</option>
                                  ),
                                )}
                              </Select>
                            </Field>
                            <Field title={t("Değer", "Value")}>
                              <Input
                                value={rule.value}
                                onChange={(event) =>
                                  updateEvaluator(e.id, {
                                    rules: e.rules.map((r, j) =>
                                      j === i
                                        ? { ...r, value: event.target.value }
                                        : r,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <Field title={t("Çıktı", "Output")}>
                              <Input
                                value={String(rule.output)}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  const q =
                                    selectedSchema?.questions[rule.question];
                                  updateEvaluator(e.id, {
                                    rules: e.rules.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            output:
                                              q?.type === "score"
                                                ? Number(value)
                                                : value === "true"
                                                  ? true
                                                  : value === "false"
                                                    ? false
                                                    : value,
                                          }
                                        : r,
                                    ),
                                  });
                                }}
                              />
                            </Field>
                            <Button
                              variant="outline"
                              className="self-end"
                              onClick={() =>
                                updateEvaluator(e.id, {
                                  rules: e.rules.filter((_, j) => j !== i),
                                })
                              }
                            >
                              {t("Sil", "Delete")}
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          onClick={() =>
                            updateEvaluator(e.id, {
                              rules: [
                                ...e.rules,
                                {
                                  question:
                                    selectedSchema?.drafts[0]?.id ?? "urgent",
                                  path: "",
                                  operator: "contains",
                                  value: "",
                                  output: false,
                                },
                              ],
                            })
                          }
                        >
                          + {t("Kural", "Rule")}
                        </Button>
                        <div className="grid gap-3 md:grid-cols-3">
                          {Object.keys(
                            selectedSchema?.questions ?? {
                              urgent: initialDraft,
                            },
                          ).map((id) => (
                            <Field key={id} title={`${id} default`}>
                              <Input
                                value={String(e.defaults[id] ?? "")}
                                onChange={(event) => {
                                  const v = event.target.value;
                                  updateEvaluator(e.id, {
                                    defaults: {
                                      ...e.defaults,
                                      [id]:
                                        selectedSchema?.questions[id]?.type ===
                                        "score"
                                          ? Number(v)
                                          : v === "true"
                                            ? true
                                            : v === "false"
                                              ? false
                                              : v,
                                    },
                                  });
                                }}
                              />
                            </Field>
                          ))}
                        </div>
                      </>
                    ) : e.kind === "cascade" ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          {t(
                            "Aşamalar sırayla çalışır. Rules varsayılanı, belirsiz System One cevabı veya servis hatası bir sonraki aşamaya geçer.",
                            "Stages run in order. Rule defaults, uncertain System One answers or service errors fall through.",
                          )}
                        </p>
                        <Field
                          title={`Fallback confidence: ${(e.fallbackConfidence ?? 0.7).toFixed(2)}`}
                        >
                          <input
                            aria-label="Fallback confidence"
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={e.fallbackConfidence ?? 0.7}
                            onChange={(event) =>
                              updateEvaluator(e.id, {
                                fallbackConfidence: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        {(e.stages ?? []).map((id, i) => (
                          <div
                            key={id}
                            className="flex items-center gap-2 rounded border p-2 text-sm"
                          >
                            <span>
                              {i + 1}.{" "}
                              {evaluators.find((v) => v.id === id)?.name ?? id}
                            </span>
                            <Button
                              variant="ghost"
                              disabled={i === 0}
                              onClick={() => {
                                const stages = [...(e.stages ?? [])];
                                [stages[i - 1], stages[i]] = [
                                  stages[i],
                                  stages[i - 1],
                                ];
                                updateEvaluator(e.id, { stages });
                              }}
                            >
                              ↑
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                updateEvaluator(e.id, {
                                  stages: e.stages?.filter((v) => v !== id),
                                })
                              }
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          {evaluators
                            .filter(
                              (v) =>
                                v.kind !== "cascade" &&
                                !e.stages?.includes(v.id),
                            )
                            .map((v) => (
                              <Button
                                key={v.id}
                                variant="outline"
                                onClick={() =>
                                  updateEvaluator(e.id, {
                                    stages: [...(e.stages ?? []), v.id],
                                  })
                                }
                              >
                                + {v.name}
                              </Button>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "API anahtarını Ayarlar’dan kaydet. Worker kayıtlı anahtarı DB’den okur; deney ve dışa aktarmalara anahtar eklenmez.",
                            "Save the API key in Settings. The worker reads saved credentials from the database; keys are excluded from experiment snapshots and exports.",
                          )}
                        </p>
                        {e.kind === "llm" && (
                          <Field title="Prompt">
                            <Textarea
                              value={e.prompt}
                              onChange={(event) =>
                                updateEvaluator(e.id, {
                                  prompt: event.target.value,
                                })
                              }
                            />
                          </Field>
                        )}
                        <div className="grid gap-3 md:grid-cols-2">
                          {(["inputPrice", "outputPrice"] as const).map(
                            (key) => (
                              <Field
                                key={key}
                                title={`${key} · USD / 1M tokens`}
                              >
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={e[key] ?? ""}
                                  placeholder={t("Bilinmiyor", "Unknown")}
                                  onChange={(event) =>
                                    updateEvaluator(e.id, {
                                      [key]:
                                        event.target.value === ""
                                          ? null
                                          : Number(event.target.value),
                                    })
                                  }
                                />
                              </Field>
                            ),
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Toplu işler için ayrı terminalde npm run worker çalıştırın. En fazla 6 motor ve 10.000 kayıt. Her motor aynı girdiyi alır.",
                    "Run npm run worker in a separate terminal. Up to 6 evaluators and 10,000 rows. Every evaluator receives the same input.",
                  )}
                </p>
                <Button
                  data-tour="experiment-start"
                  disabled={
                    busy || !datasetId || !schemaId || !evaluators.length
                  }
                  onClick={() =>
                    void action(async () => {
                      const value = await api({
                        action: "run",
                        name: runName,
                        datasetId,
                        schemaId,
                        evaluators,
                        policy,
                      });
                      openRun(value);
                      toast.success(
                        t(
                          "Deney kuyruğa alındı; Analiz sekmesini açın.",
                          "Experiment queued; open Analysis.",
                        ),
                      );
                    })
                  }
                >
                  {t("Deneyi başlat", "Start experiment")}
                </Button>
              </Panel>
            </TabsContent>
            <TabsContent value="results" className="space-y-4 pt-4">
              <Panel
                tour="run-history"
                title={t("Deney geçmişi", "Experiment history")}
              >
                <Select
                  label="Run history"
                  value={runId}
                  onChange={(id) =>
                    void action(async () => openRun(await api(undefined, id)))
                  }
                >
                  <option value="">
                    {t("Deney seçin", "Select experiment")}
                  </option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.status} · {r.progress}/{r.total}
                    </option>
                  ))}
                </Select>
              </Panel>
              {run && stats && (
                <>
                  <Panel title={`${run.name} · ${run.status}`}>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <span>{run.dataset.name}</span>
                      <span>{run.schema.name}</span>
                      <span>
                        {
                          run.items.filter((i) =>
                            ["done", "error"].includes(i.status),
                          ).length
                        }
                        /{run.items.length}
                      </span>
                      {run.parentId && (
                        <button
                          className="underline"
                          onClick={() =>
                            void action(async () =>
                              openRun(await api(undefined, run.parentId)),
                            )
                          }
                        >
                          {t("Kaynak deneyi aç", "Open parent run")}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={
                          busy || !["running", "queued"].includes(run.status)
                        }
                        onClick={() =>
                          void action(async () =>
                            setRun(await api({ action: "cancel", id: run.id })),
                          )
                        }
                      >
                        {t("İptal", "Cancel")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || run.status !== "cancelled"}
                        onClick={() =>
                          void action(async () =>
                            setRun(await api({ action: "resume", id: run.id })),
                          )
                        }
                      >
                        {t("Devam et", "Resume")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          busy ||
                          ["running", "queued"].includes(run.status) ||
                          !run.items.some((i) => i.status === "error")
                        }
                        onClick={() =>
                          void action(async () =>
                            setRun(await api({ action: "retry", id: run.id })),
                          )
                        }
                      >
                        {t("Hataları yeniden dene", "Retry errors")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          download(`${run.id}.json`, {
                            ...run,
                            analysisPolicy: policy,
                          })
                        }
                      >
                        JSON export
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const escape = (v: unknown) =>
                            `"${String(v ?? "").replace(/"/g, '""')}"`;
                          download(
                            `${run.id}.csv`,
                            [
                              [
                                "row_id",
                                "evaluator",
                                "question",
                                "expected",
                                "prediction",
                                "probability",
                                "confidence",
                                "status",
                                "error",
                              ],
                              ...compare.flatMap((c) =>
                                c.stats.samples.map((s) => [
                                  s.row.id,
                                  c.evaluator.name,
                                  activeQuestion,
                                  s.truth,
                                  s.prediction,
                                  s.answer?.probability,
                                  s.answer?.confidence,
                                  s.item?.status,
                                  s.item?.error,
                                ]),
                              ),
                            ]
                              .map((row) => row.map(escape).join(","))
                              .join("\r\n"),
                          );
                        }}
                      >
                        CSV export
                      </Button>
                    </div>
                  </Panel>
                  <div
                    data-tour="analysis-filters"
                    className="grid gap-3 md:grid-cols-4"
                  >
                    <Field title={t("Soru", "Question")}>
                      <Select
                        label="Analysis question"
                        value={activeQuestion}
                        onChange={(v) => {
                          setQuestionId(v);
                          setCell(null);
                        }}
                      >
                        {Object.keys(run.schema.questions).map((id) => (
                          <option key={id}>{id}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field title={t("Motor", "Evaluator")}>
                      <Select
                        label="Analysis evaluator"
                        value={activeEvaluator!}
                        onChange={setEvaluatorId}
                      >
                        {run.evaluators.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field title="Split">
                      <Select label="Split" value={split} onChange={setSplit}>
                        <option value="all">{t("Tümü", "All")}</option>
                        <option>validation</option>
                        <option>test</option>
                      </Select>
                    </Field>
                    <Field title="Segment">
                      <Select
                        label="Segment"
                        value={segment}
                        onChange={setSegment}
                      >
                        <option value="">{t("Tümü", "All")}</option>
                        {[...new Set(run.dataset.rows.map((r) => r.segment))]
                          .filter(Boolean)
                          .map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      ["Accuracy · auto", percent(stats.accuracy)],
                      ["Macro F1", percent(stats.macroF1)],
                      ["Coverage", percent(stats.coverage)],
                      ["MAE", stats.mae?.toFixed(3) ?? "—"],
                      [
                        t("Hata / bekleyen", "Errors / pending"),
                        `${stats.errors} / ${stats.pending}`,
                      ],
                      [
                        "p50 / p95",
                        `${stats.p50 ?? "—"} / ${stats.p95 ?? "—"} ms`,
                      ],
                    ].map(([name, value]) => (
                      <Card key={name}>
                        <CardContent className="py-4">
                          <p className="text-xs text-muted-foreground">
                            {name}
                          </p>
                          <p className="mt-1 text-xl font-semibold">{value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <AdvancedAnalysis
                    key={run.id}
                    run={run}
                    question={activeQuestion}
                    evaluator={activeEvaluator!}
                    policy={policy}
                    split={split}
                    segment={segment}
                    tr={tr}
                    onPolicy={(value) => {
                      setPolicy(value);
                      setSplit("test");
                      setCell(null);
                    }}
                  />
                  <Panel tour="threshold-tuning" title="Threshold tuning">
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "Accuracy yalnızca etiketli otomatik kararlarda; F1 review kararlarını kaçırılan sınıflar olarak sayar. Coverage tüm seçili kayıtları kapsar.",
                        "Accuracy uses labeled automatic decisions; F1 counts reviews as missed classes. Coverage includes all selected rows.",
                      )}
                    </p>
                    <div className="grid gap-4 md:grid-cols-4">
                      {(
                        ["threshold", "confidence", "reviewMargin"] as const
                      ).map((key) => (
                        <Field
                          key={key}
                          title={`${key}: ${policy[key].toFixed(2)}`}
                        >
                          <input
                            aria-label={key}
                            type="range"
                            min="0"
                            max={key === "reviewMargin" ? 0.5 : 1}
                            step="0.01"
                            value={policy[key]}
                            onChange={(e) => {
                              setPolicy({
                                ...policy,
                                [key]: Number(e.target.value),
                              });
                              setCell(null);
                            }}
                          />
                        </Field>
                      ))}
                      <Field
                        title={t(
                          "Score sınıf sınırı (opsiyonel)",
                          "Score class boundary (optional)",
                        )}
                      >
                        <Input
                          type="number"
                          value={policy.scoreBoundary ?? ""}
                          onChange={(e) =>
                            setPolicy({
                              ...policy,
                              scoreBoundary:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Button
                      variant="outline"
                      disabled={
                        run.schema.questions[activeQuestion].type !== "noul" ||
                        !stats.labeled ||
                        !stats.samples.some(
                          (s) => s.answer?.probability !== undefined,
                        ) ||
                        busy
                      }
                      onClick={() => {
                        const validation = analyze(
                          run,
                          activeEvaluator!,
                          activeQuestion,
                          policy,
                          "validation",
                          segment,
                        );
                        if (!validation.labeled || !validation.answered) {
                          toast.error(
                            t(
                              "Etiketli validation sonuçları gerekli.",
                              "Labeled validation results required.",
                            ),
                          );
                          return;
                        }
                        const sweep = Array.from({ length: 101 }, (_, i) => {
                          const candidate = { ...policy, threshold: i / 100 };
                          return {
                            candidate,
                            score:
                              analyze(
                                run,
                                activeEvaluator!,
                                activeQuestion,
                                candidate,
                                "validation",
                                segment,
                              ).macroF1 ?? -1,
                          };
                        }).sort(
                          (a, b) =>
                            b.score - a.score ||
                            Math.abs(a.candidate.threshold - 0.5) -
                              Math.abs(b.candidate.threshold - 0.5),
                        );
                        setPolicy(sweep[0].candidate);
                        setSplit("test");
                        toast.success(
                          t(
                            "Eşik validation’da seçildi. Test sonuçları gösteriliyor.",
                            "Threshold selected on validation. Showing test results.",
                          ),
                        );
                      }}
                    >
                      {t(
                        "Validation’da en iyi F1 → test",
                        "Best validation F1 → test",
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setPolicy(run.policy)}
                    >
                      {t("Kayıtlı politikaya dön", "Reset to saved policy")}
                    </Button>
                  </Panel>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Panel tour="confusion-matrix" title="Confusion matrix">
                      <p className="text-xs text-muted-foreground">
                        {stats.labeled}{" "}
                        {t(
                          "etiketli kayıt. Satır: gerçek, sütun: tahmin. Hücreye tıklayarak inceleyin.",
                          "labeled rows. Rows: actual; columns: predicted. Click a cell to inspect.",
                        )}
                      </p>
                      {stats.labels.length ? (
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="p-2 text-left">
                                  Actual / predicted
                                </th>
                                {stats.labels.map((l) => (
                                  <th key={l} className="p-2">
                                    {l}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {stats.labels.map((actual) => (
                                <tr key={actual}>
                                  <th className="p-2 text-left">{actual}</th>
                                  {stats.labels.map((prediction) => (
                                    <td key={prediction} className="p-1">
                                      <button
                                        className={`w-full rounded p-3 ${actual === prediction ? "bg-emerald-100 text-emerald-900" : "bg-muted"}`}
                                        onClick={() => {
                                          setCell({
                                            truth: actual,
                                            prediction,
                                          });
                                          setFilter("all");
                                        }}
                                      >
                                        {stats.matrix[actual][prediction]}
                                      </button>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t(
                            "Etiketli sınıflandırma sonuçları gerekli. Sayısal Score için MAE gösterilir.",
                            "Requires labeled classification results. Numeric Score uses MAE.",
                          )}
                        </p>
                      )}
                      <div className="overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              {[
                                "Class",
                                "Precision",
                                "Recall",
                                "F1",
                                "Support",
                              ].map((v) => (
                                <th key={v} className="p-2 text-left">
                                  {v}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stats.perClass.map((c) => (
                              <tr key={c.label}>
                                <td className="p-2">{c.label}</td>
                                <td>{percent(c.precision)}</td>
                                <td>{percent(c.recall)}</td>
                                <td>{percent(c.f1)}</td>
                                <td>{c.support}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                    <Panel
                      title={
                        run.schema.questions[activeQuestion].type === "noul"
                          ? "Probability distribution · P(yes)"
                          : "Confidence distribution"
                      }
                    >
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "Noul: P(evet). Choice/Score: dağılımdan türetilen confidence. Rules ve LLM için confidence üretilmez.",
                          "Noul: P(yes). Choice/Score: distribution confidence. No fabricated confidence for rules or LLM.",
                        )}
                      </p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.distribution}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="range" fontSize={10} />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="correct" stackId="a" fill="#10b981" />
                            <Bar dataKey="wrong" stackId="a" fill="#f43f5e" />
                            <Bar
                              dataKey="unlabeled"
                              stackId="a"
                              fill="#94a3b8"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Panel>
                  </div>
                  <Panel
                    tour="model-comparison"
                    title={t(
                      "Model ve motor karşılaştırması",
                      "Model & evaluator comparison",
                    )}
                  >
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            {[
                              "Evaluator",
                              "Accuracy",
                              "Macro F1",
                              "MAE",
                              "Coverage",
                              "p95",
                              "Errors",
                              "Tokens",
                              "Cost USD",
                              "Rows/s",
                              "Fallback",
                            ].map((v) => (
                              <th key={v} className="p-2 text-left">
                                {v}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {compare.map((c) => (
                            <tr className="border-t" key={c.evaluator.id}>
                              <td className="p-2">
                                <strong>{c.evaluator.name}</strong>
                                <p className="text-xs text-muted-foreground">
                                  {c.evaluator.kind} · {c.evaluator.model}
                                </p>
                              </td>
                              <td>{percent(c.stats.accuracy)}</td>
                              <td>{percent(c.stats.macroF1)}</td>
                              <td>{c.stats.mae?.toFixed(3) ?? "—"}</td>
                              <td>{percent(c.stats.coverage)}</td>
                              <td>{c.stats.p95 ?? "—"}</td>
                              <td>{c.stats.errors}</td>
                              <td>
                                {c.stats.inputTokens + c.stats.outputTokens}
                              </td>
                              <td>{c.stats.cost?.toFixed(5) ?? "—"}</td>
                              <td>{c.stats.throughput?.toFixed(1) ?? "—"}</td>
                              <td>{percent(c.stats.fallbackRate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Aynı kayıtlar, soru ve politika. Eksik cevaplar hata/bekleyen sütunlarında görünür; maliyet yalnızca girilen token fiyatlarıyla tahmindir.",
                        "Same rows, question and policy. Missing answers remain errors/pending; cost is estimated using entered token prices.",
                      )}
                    </p>
                  </Panel>
                  <Panel title={t("Kayıt inceleme", "Inspect records")}>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select
                        label="Record filter"
                        value={filter}
                        onChange={(value) => {
                          setFilter(value);
                          setRowPage(0);
                        }}
                      >
                        {[
                          "all",
                          "wrong",
                          "errors",
                          "review",
                          "disagreement",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Select>
                      {cell && (
                        <Button variant="outline" onClick={() => setCell(null)}>
                          {cell.truth} → {cell.prediction} ×
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {visible.length} {t("kayıt", "records")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <Button
                        variant="outline"
                        disabled={currentPage === 0}
                        onClick={() => setRowPage(currentPage - 1)}
                      >
                        {t("Önceki", "Previous")}
                      </Button>
                      <span>
                        {currentPage + 1}/{maxPage + 1} · 100/page
                      </span>
                      <Button
                        variant="outline"
                        disabled={currentPage === maxPage}
                        onClick={() => setRowPage(currentPage + 1)}
                      >
                        {t("Sonraki", "Next")}
                      </Button>
                    </div>
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            {[
                              "Select",
                              "ID / state",
                              "Actual",
                              "Predicted",
                              "Status / signal",
                            ].map((v) => (
                              <th key={v} className="p-2 text-left">
                                {v}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visible
                            .slice(currentPage * 100, (currentPage + 1) * 100)
                            .map((s) => (
                              <tr className="border-t align-top" key={s.row.id}>
                                <td className="p-2">
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${s.row.id}`}
                                    checked={selectedRows.includes(s.row.id)}
                                    onChange={(e) =>
                                      setSelectedRows(
                                        e.target.checked
                                          ? [...selectedRows, s.row.id]
                                          : selectedRows.filter(
                                              (id) => id !== s.row.id,
                                            ),
                                      )
                                    }
                                  />
                                </td>
                                <td className="max-w-96 p-2">
                                  <strong>{s.row.id}</strong>
                                  <details>
                                    <summary className="cursor-pointer truncate text-xs text-muted-foreground">
                                      {typeof s.row.state === "string"
                                        ? s.row.state
                                        : JSON.stringify(s.row.state)}
                                    </summary>
                                    <pre className="whitespace-pre-wrap text-xs">
                                      {JSON.stringify(
                                        {
                                          state: s.row.state,
                                          answers: s.item?.answers,
                                          raw: s.item?.raw,
                                          resolvedModel: s.item?.resolvedModel,
                                        },
                                        null,
                                        2,
                                      )}
                                    </pre>
                                  </details>
                                </td>
                                <td className="p-2">{s.truth ?? "—"}</td>
                                <td className="p-2">{s.prediction ?? "—"}</td>
                                <td className="p-2 text-xs">
                                  {s.item?.status}
                                  <p className="text-red-600">
                                    {s.item?.error}
                                  </p>
                                  {s.answer?.probability !== undefined && (
                                    <p>
                                      P(yes): {s.answer.probability.toFixed(3)}
                                    </p>
                                  )}
                                  {s.answer?.confidence !== undefined && (
                                    <p>
                                      confidence:{" "}
                                      {s.answer.confidence.toFixed(3)}
                                    </p>
                                  )}
                                  {s.answer?.trace && <p>{s.answer.trace}</p>}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <Panel tour="replay" title="Replay">
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "Policy replay ham cevapları yeniden kullanır. Inference replay yeni API çağrıları yapar; Deney oluştur sekmesindeki motorlar ve şema seçiliyse yeni yapılandırmayı kullanır.",
                        "Policy replay reuses raw answers. Inference replay makes new API calls; it uses evaluators and schema from New experiment when selected.",
                      )}
                    </p>
                    <Field title={t("Replay kapsamı", "Replay scope")}>
                      <Select
                        label="Replay scope"
                        value={replayScope}
                        onChange={setReplayScope}
                      >
                        <option value="all">
                          {t("Tüm kayıtlar", "All records")}
                        </option>
                        <option value="visible">
                          {t("Filtredeki kayıtlar", "Filtered records")}
                        </option>
                        <option value="selected">
                          {t("Seçili kayıtlar", "Selected records")}
                        </option>
                      </Select>
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      {(["policy", "inference"] as const).map((mode) => (
                        <Button
                          key={mode}
                          variant={mode === "policy" ? "default" : "outline"}
                          disabled={
                            busy ||
                            (mode === "policy" &&
                              ["running", "queued"].includes(run.status))
                          }
                          onClick={() =>
                            void action(async () => {
                              const value = await api({
                                action: "replay",
                                id: run.id,
                                mode,
                                policy,
                                rowIds:
                                  replayScope === "selected"
                                    ? selectedRows
                                    : replayScope === "visible"
                                      ? visible.map((s) => s.row.id)
                                      : undefined,
                                ...(mode === "inference"
                                  ? {
                                      evaluators: evaluators.length
                                        ? evaluators
                                        : undefined,
                                      schemaId: schemaId || undefined,
                                    }
                                  : {}),
                              });
                              openRun(value);
                            })
                          }
                        >
                          {mode === "policy"
                            ? t(
                                "Politikayı tekrar uygula · API yok",
                                "Replay policy · no API calls",
                              )
                            : t(
                                "Inference tekrar çalıştır · API kullanır",
                                "Replay inference · uses API",
                              )}
                        </Button>
                      ))}
                    </div>
                  </Panel>
                </>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
