"use client";

import { useMemo, useState } from "react";
import { Loader2, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { format, useI18n } from "@/components/i18n";
import { useModelSettings } from "@/components/model-settings-provider";
import { ModelSettingsDialog } from "@/components/model-settings-dialog";
import { AnswerCard } from "@/components/playground/answer-card";
import { QuestionEditor } from "@/components/playground/question-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PRESETS } from "@/lib/presets";
import { cn } from "@/lib/utils";
import {
  BULK_CONCURRENCY,
  BULK_MAX_STATES,
  buildQuestions,
  nextQuestionId,
  parseBulkStates,
  parseState,
  previewState,
  validateDrafts,
  type Answer,
  type BulkDelimiter,
  type EvaluateResponse,
  type JsonStructure,
  type QuestionDraft,
  type QuestionsMap,
} from "@/lib/typesafe";

type RunResult = {
  response: EvaluateResponse;
  request: { state: JsonStructure; model: string; questions: QuestionsMap };
  answerOrder: string[];
};

type BulkStateResult = {
  state: JsonStructure;
  status: "pending" | "running" | "done" | "error";
  response: EvaluateResponse | null;
  error: string | null;
};

type BulkRunResult = {
  model: string;
  questions: QuestionsMap;
  answerOrder: string[];
  results: BulkStateResult[];
};

type StateMode = "single" | "bulk";

function stateKind(
  state: JsonStructure,
): "kindText" | "kindArray" | "kindObject" {
  if (typeof state === "string") return "kindText";
  if (Array.isArray(state)) return "kindArray";
  return "kindObject";
}

function pctShort(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function BulkAnswerCell({ answer }: { answer: Answer | undefined }) {
  if (!answer) return <span className="text-muted-foreground">—</span>;
  if (answer.type === "noul") {
    const tone =
      answer.noul >= 0.75
        ? "text-emerald-600 dark:text-emerald-400"
        : answer.noul <= 0.25
          ? "text-red-600 dark:text-red-400"
          : "";
    return (
      <span className={cn("font-mono text-xs tabular-nums", tone)}>
        {answer.noul.toFixed(3)}
      </span>
    );
  }
  if (answer.type === "choice") {
    return (
      <span className="font-mono text-xs">
        {answer.choice}
        <span className="ml-1 text-muted-foreground">
          {pctShort(answer.probabilities[answer.choice] ?? 0)}
        </span>
      </span>
    );
  }
  return (
    <span className="font-mono text-xs tabular-nums">
      {answer.score.toFixed(2)}
    </span>
  );
}

function BulkAnswers({
  bulkResult,
  running,
}: {
  bulkResult: BulkRunResult;
  running: boolean;
}) {
  const dict = useI18n();
  const { results, answerOrder, model } = bulkResult;
  const done = results.filter(
    (r) => r.status === "done" || r.status === "error",
  ).length;
  const ok = results.filter((r) => r.status === "done");
  const failed = results.filter((r) => r.status === "error").length;
  const avgLatency = ok.length
    ? Math.round(
        ok.reduce((sum, r) => sum + (r.response?.latencyMs ?? 0), 0) /
          ok.length,
      )
    : 0;
  const tokens = ok.reduce(
    (sum, r) =>
      sum +
      (r.response?.usage?.input_tokens ?? 0) +
      (r.response?.usage?.output_tokens ?? 0),
    0,
  );

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
          <div>
            <span className="text-muted-foreground">{dict.answers.model}</span>
            <span className="font-mono">{model}</span>
          </div>
          <div>
            <span className="font-mono">
              {format(dict.bulk.progress, { done, total: results.length })}
              {running ? ` — ${dict.bulk.rowRunning}` : ""}
            </span>
          </div>
          {avgLatency > 0 && (
            <div>
              <span className="text-muted-foreground">
                {dict.bulk.avgLatency}
              </span>
              <span className="font-mono">{avgLatency} ms</span>
            </div>
          )}
          {tokens > 0 && (
            <div>
              <span className="text-muted-foreground">{dict.bulk.tokens}</span>
              <span className="font-mono">{tokens}</span>
            </div>
          )}
          {failed > 0 && (
            <div>
              <span className="text-red-600 dark:text-red-400">
                {format(dict.bulk.failedCount, { count: failed })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">
                {dict.bulk.stateColumn}
              </th>
              {answerOrder.map((id) => (
                <th
                  key={id}
                  className="px-3 py-2 text-left font-mono text-xs font-medium"
                >
                  {id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((row, index) => (
              <tr key={index} className="border-b align-top last:border-b-0">
                <td className="max-w-72 px-3 py-2">
                  <span
                    className="block truncate font-mono text-xs"
                    title={previewState(row.state, 1000)}
                  >
                    {previewState(row.state)}
                  </span>
                  {row.status === "error" && (
                    <span
                      className="block truncate text-xs text-red-600 dark:text-red-400"
                      title={row.error ?? undefined}
                    >
                      {dict.bulk.rowFailed}: {row.error}
                    </span>
                  )}
                </td>
                {answerOrder.map((id) => {
                  const answer = row.response?.answers[id];
                  return (
                    <td key={id} className="px-3 py-2">
                      {row.status === "done" ? (
                        <BulkAnswerCell answer={answer} />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {row.status === "running"
                            ? dict.bulk.rowRunning
                            : dict.bulk.rowPending}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Playground() {
  const dict = useI18n();
  const { settings, error: settingsError, mutate } = useModelSettings();
  const profile =
    settings?.models.find(
      (profile) =>
        profile.id === settings.preferences.defaultProfileId &&
        profile.kind === "system-one",
    ) ?? settings?.models.find((profile) => profile.kind === "system-one");
  const model = profile?.model ?? "",
    baseUrl = profile?.baseUrl ?? "";
  const stateMode = settings?.preferences.stateMode ?? "single",
    delimiter = settings?.preferences.delimiter ?? "newline";
  function setStateMode(value: StateMode) {
    void mutate({ action: "preferences", stateMode: value }).catch((error) =>
      toast.error(error.message),
    );
  }
  function setDelimiter(value: BulkDelimiter) {
    void mutate({ action: "preferences", delimiter: value }).catch((error) =>
      toast.error(error.message),
    );
  }
  const [preset, setPreset] = useState<string>("none");
  const [stateText, setStateText] = useState<string>("");
  const [bulkText, setBulkText] = useState<string>("");
  const [drafts, setDrafts] = useState<QuestionDraft[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkRunResult | null>(null);

  const parsedState = useMemo(() => parseState(stateText), [stateText]);
  const bulkStates = useMemo(
    () => parseBulkStates(bulkText, delimiter),
    [bulkText, delimiter],
  );
  function applyPreset(name: string) {
    setPreset(name);
    if (name === "none") {
      setStateText("");
      setBulkText("");
      setDrafts([]);
      setResult(null);
      setBulkResult(null);
      return;
    }
    const found = PRESETS.find((p) => p.name === name);
    if (!found) return;
    setStateText(found.state);
    setDrafts(found.questions.map((q) => ({ ...q })));
    setResult(null);
    setBulkResult(null);
  }

  function addDraft(kind: QuestionDraft["kind"]) {
    setDrafts((prev) => {
      const id = nextQuestionId(prev);
      if (kind === "noul") {
        return [
          ...prev,
          { id, kind, instructions: "", trueCriteria: "", falseCriteria: "" },
        ];
      }
      if (kind === "choice") {
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
      }
      return [...prev, { id, kind, instructions: "", levels: ["", ""] }];
    });
  }

  async function evaluateOne(
    state: JsonStructure,
    questions: QuestionsMap,
  ): Promise<EvaluateResponse> {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state,
        profileId: profile?.id,
        questions,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const error = new Error(
        data.error ?? format(dict.toasts.requestFailed, { status: res.status }),
      ) as Error & { upstream?: unknown };
      if (data.upstream) error.upstream = data.upstream;
      throw error;
    }
    return data as EvaluateResponse;
  }

  async function runBulk(questions: QuestionsMap) {
    const states = bulkStates;
    const answerOrder = drafts.map((d) => d.id);
    setBulkResult({
      model,
      questions,
      answerOrder,
      results: states.map((state) => ({
        state,
        status: "pending" as const,
        response: null,
        error: null,
      })),
    });
    let cursor = 0;
    const update = (index: number, patch: Partial<BulkStateResult>) => {
      setBulkResult((prev) =>
        prev
          ? {
              ...prev,
              results: prev.results.map((r, i) =>
                i === index ? { ...r, ...patch } : r,
              ),
            }
          : prev,
      );
    };
    const worker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= states.length) return;
        update(index, { status: "running" });
        try {
          const response = await evaluateOne(states[index], questions);
          update(index, { status: "done", response });
        } catch (error) {
          update(index, {
            status: "error",
            error: String((error as Error)?.message ?? error),
          });
        }
      }
    };
    setRunning(true);
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(BULK_CONCURRENCY, states.length) },
          worker,
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  async function run() {
    const validationError = validateDrafts(drafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!model) {
      toast.error(dict.toasts.pickModel);
      return;
    }

    const trimmedBaseUrl = baseUrl.trim();
    if (trimmedBaseUrl) {
      try {
        new URL(trimmedBaseUrl);
      } catch {
        toast.error(dict.toasts.invalidUrl);
        return;
      }
    }

    const questions = buildQuestions(drafts);

    if (stateMode === "bulk") {
      if (bulkStates.length === 0) {
        toast.error(dict.bulk.empty);
        return;
      }
      if (bulkStates.length > BULK_MAX_STATES) {
        toast.error(
          format(dict.bulk.limit, {
            max: BULK_MAX_STATES,
            count: bulkStates.length,
          }),
        );
        return;
      }
      await runBulk(questions);
      return;
    }

    if (parsedState === null) {
      toast.error(dict.toasts.stateEmpty);
      return;
    }

    setRunning(true);
    try {
      const response = await evaluateOne(parsedState, questions);
      setResult({
        response,
        request: { state: parsedState, model, questions },
        answerOrder: drafts.map((d) => d.id),
      });
    } catch (error) {
      const upstream = (error as { upstream?: unknown }).upstream;
      toast.error(String((error as Error)?.message ?? error), {
        description: upstream ? JSON.stringify(upstream, null, 2) : undefined,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="workspace-panel">
      {settingsError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {settingsError}
        </p>
      )}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {dict.header.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dict.header.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger
              data-tour="playground-preset"
              className="h-9 w-44"
              aria-label={dict.preset.label}
            >
              <SelectValue placeholder={dict.preset.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{dict.preset.none}</SelectItem>
              {PRESETS.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <select
            data-tour="playground-model"
            value={profile?.id ?? ""}
            disabled={!settings || running}
            aria-label={dict.model.label}
            className="h-9 w-44 rounded-md border bg-background px-2 font-mono text-xs"
            onChange={(e) => {
              void mutate({
                action: "preferences",
                defaultProfileId: e.target.value,
              }).catch((error) => toast.error(error.message));
            }}
          >
            <option value="" disabled>
              {dict.model.placeholder}
            </option>
            {settings?.models
              .filter((profile) => profile.kind === "system-one")
              .map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} · {profile.model}
                </option>
              ))}
          </select>
          <Button
            data-tour="playground-run"
            onClick={run}
            disabled={running || !profile}
            className="h-9"
          >
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {dict.actions.run}
          </Button>
          <ModelSettingsDialog iconOnly />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card data-tour="playground-state">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle>{dict.state.title}</CardTitle>
                  {stateMode === "single" && parsedState !== null && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {dict.state[stateKind(parsedState)]}
                    </Badge>
                  )}
                  {stateMode === "bulk" && bulkStates.length > 0 && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {format(dict.bulk.statesCount, {
                        count: bulkStates.length,
                      })}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {stateMode === "bulk" && (
                    <Select
                      value={delimiter}
                      onValueChange={(v) => setDelimiter(v as BulkDelimiter)}
                    >
                      <SelectTrigger
                        className="h-8 w-36 text-xs"
                        aria-label={dict.bulk.delimiter}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newline">
                          {dict.bulk.newline}
                        </SelectItem>
                        <SelectItem value="comma">{dict.bulk.comma}</SelectItem>
                        <SelectItem value="semicolon">
                          {dict.bulk.semicolon}
                        </SelectItem>
                        <SelectItem value="tab">{dict.bulk.tab}</SelectItem>
                        <SelectItem value="jsonl">{dict.bulk.jsonl}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Tabs
                    value={stateMode}
                    onValueChange={(v) => setStateMode(v as StateMode)}
                  >
                    <TabsList className="h-8">
                      <TabsTrigger value="single" className="h-7 px-3 text-xs">
                        {dict.state.single}
                      </TabsTrigger>
                      <TabsTrigger value="bulk" className="h-7 px-3 text-xs">
                        {dict.state.bulk}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
              <CardDescription>
                {stateMode === "single"
                  ? dict.state.description
                  : dict.bulk.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stateMode === "single" ? (
                <Textarea
                  value={stateText}
                  onChange={(e) => setStateText(e.target.value)}
                  placeholder={dict.state.placeholder}
                  className="min-h-40 font-mono text-xs"
                />
              ) : (
                <Textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={dict.bulk.placeholder}
                  className="min-h-40 font-mono text-xs"
                />
              )}
            </CardContent>
          </Card>

          <Card data-tour="playground-questions">
            <CardHeader>
              <CardTitle>{dict.questions.label}</CardTitle>
              <CardDescription className="mt-1.5">
                {dict.questions.description}
              </CardDescription>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 h-7 text-xs"
                  >
                    <Plus className="size-3" /> {dict.questions.add}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5"
                    onSelect={() => addDraft("noul")}
                  >
                    <span className="font-medium">
                      {dict.questions.noul.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dict.questions.noul.description}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5"
                    onSelect={() => addDraft("choice")}
                  >
                    <span className="font-medium">
                      {dict.questions.choice.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dict.questions.choice.description}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5"
                    onSelect={() => addDraft("score")}
                  >
                    <span className="font-medium">
                      {dict.questions.score.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dict.questions.score.description}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-3">
              {drafts.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {dict.questions.empty}
                </p>
              )}
              {drafts.map((draft, index) => (
                <QuestionEditor
                  key={index}
                  draft={draft}
                  onChange={(next) =>
                    setDrafts((prev) =>
                      prev.map((d, i) => (i === index ? next : d)),
                    )
                  }
                  onRemove={() =>
                    setDrafts((prev) => prev.filter((_, i) => i !== index))
                  }
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div data-tour="playground-results" className="min-w-0">
          <Tabs defaultValue="answers">
            <TabsList>
              <TabsTrigger value="answers">{dict.tabs.answers}</TabsTrigger>
              <TabsTrigger value="request">{dict.tabs.request}</TabsTrigger>
              <TabsTrigger value="response">{dict.tabs.response}</TabsTrigger>
            </TabsList>
            <TabsContent value="answers" className="mt-4 space-y-4">
              {stateMode === "bulk" && bulkResult ? (
                <BulkAnswers bulkResult={bulkResult} running={running} />
              ) : stateMode === "bulk" || !result ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <p className="text-sm text-muted-foreground">
                      {dict.answers.empty}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">
                          {dict.answers.model}
                        </span>
                        <span className="font-mono">
                          {result.response.model}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          {dict.answers.latency}
                        </span>
                        <span className="font-mono">
                          {result.response.latencyMs} ms
                        </span>
                      </div>
                      {result.response.usage && (
                        <div>
                          <span className="text-muted-foreground">
                            {dict.answers.tokens}
                          </span>
                          <span className="font-mono">
                            {format(dict.answers.tokensInOut, {
                              input: result.response.usage.input_tokens ?? 0,
                              output: result.response.usage.output_tokens ?? 0,
                            })}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">
                          {dict.answers.provider}
                        </span>
                        <span className="font-mono">
                          {result.response.provider}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  {result.answerOrder.map((id) => {
                    const answer = result.response.answers[id];
                    if (!answer) return null;
                    return <AnswerCard key={id} id={id} answer={answer} />;
                  })}
                </>
              )}
            </TabsContent>
            <TabsContent value="request" className="mt-4">
              <Card>
                <CardContent className="py-0">
                  <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-xs leading-relaxed">
                    {stateMode === "bulk" && bulkResult
                      ? JSON.stringify(
                          bulkResult.results.map((r) => ({
                            state: r.state,
                            model: bulkResult.model,
                            questions: bulkResult.questions,
                          })),
                          null,
                          2,
                        )
                      : result
                        ? JSON.stringify(result.request, null, 2)
                        : dict.answers.requestEmpty}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="response" className="mt-4">
              <Card>
                <CardContent className="py-0">
                  <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-xs leading-relaxed">
                    {stateMode === "bulk" && bulkResult
                      ? JSON.stringify(
                          bulkResult.results.map(
                            (r) => r.response ?? { error: r.error },
                          ),
                          null,
                          2,
                        )
                      : result
                        ? JSON.stringify(result.response, null, 2)
                        : dict.answers.responseEmpty}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Separator className="my-10" />
      <footer className="pb-8 text-xs text-muted-foreground">
        {dict.footer}
      </footer>
    </div>
  );
}
