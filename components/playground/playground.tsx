"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { format, useI18n } from "@/components/i18n";
import { useModelSettings } from "@/components/model-settings-provider";
import { ModelSettingsDialog } from "@/components/model-settings-dialog";
import { AnswerCard } from "@/components/playground/answer-card";
import {
  ResultsTable,
  type ComparisonResult,
  type ModelSummary,
  type ResultRow,
} from "@/components/playground/results-table";
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
  DropdownMenuCheckboxItem,
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
import type { ModelProfile } from "@/lib/model-settings-types";
import {
  BULK_CONCURRENCY,
  BULK_MAX_STATES,
  buildQuestions,
  nextQuestionId,
  parseBulkStates,
  parseState,
  validateDrafts,
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
  profileId: string;
  model: string;
  questions: QuestionsMap;
  answerOrder: string[];
  results: BulkStateResult[];
};

type StateMode = "single" | "bulk";

const MAX_MODELS = 6;

function stateKind(
  state: JsonStructure,
): "kindText" | "kindArray" | "kindObject" {
  if (typeof state === "string") return "kindText";
  if (Array.isArray(state)) return "kindArray";
  return "kindObject";
}

function BulkAnswers({
  bulkResults,
  running,
}: {
  bulkResults: BulkRunResult[];
  running: boolean;
}) {
  const answerOrder = bulkResults[0]?.answerOrder ?? [];
  const stateCount = bulkResults[0]?.results.length ?? 0;

  const rows: ResultRow[] = [];
  for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
    bulkResults.forEach((entry, modelIndex) => {
      const row = entry.results[stateIndex];
      const response = row.response;
      rows.push({
        key: `${entry.profileId}-${stateIndex}`,
        state: row.state,
        stateSpan: modelIndex === 0 ? bulkResults.length : undefined,
        model: entry.model,
        status: row.status,
        error: row.error,
        meta: response
          ? {
              model: response.model,
              provider: response.provider,
              latencyMs: response.latencyMs,
              usage: response.usage,
            }
          : {},
        answers: response?.answers ?? {},
      });
    });
  }

  const summary: ModelSummary[] = bulkResults.map((entry) => {
    const ok = entry.results.filter((r) => r.status === "done");
    const finished = entry.results.filter(
      (r) => r.status === "done" || r.status === "error",
    );
    const tokens = ok.reduce(
      (sum, r) =>
        sum +
        (r.response?.usage?.input_tokens ?? 0) +
        (r.response?.usage?.output_tokens ?? 0),
      0,
    );
    const avgLatency = ok.length
      ? Math.round(
          ok.reduce((sum, r) => sum + (r.response?.latencyMs ?? 0), 0) /
            ok.length,
        )
      : 0;
    const failed = entry.results.filter((r) => r.status === "error").length;
    return {
      key: entry.profileId,
      label: entry.model,
      done: finished.length,
      total: entry.results.length,
      failed,
      avgLatencyMs: avgLatency > 0 ? avgLatency : undefined,
      tokens: tokens > 0 ? tokens : undefined,
    };
  });

  return (
    <ResultsTable
      rows={rows}
      answerOrder={answerOrder}
      showState
      summary={summary}
      running={running}
    />
  );
}

function EmptyAnswers({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

export function Playground() {
  const dict = useI18n();
  const { settings, error: settingsError, mutate } = useModelSettings();
  const systemProfiles =
    settings?.models.filter((profile) => profile.kind === "system-one") ?? [];
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const pendingRef = useRef<string[] | null>(null);
  const storedProfileIds = settings
    ? (settings.preferences.profileIds ??
      (settings.preferences.defaultProfileId
        ? [settings.preferences.defaultProfileId]
        : []))
    : [];
  const resolveProfiles = (ids: string[]) =>
    ids
      .map((id) => systemProfiles.find((profile) => profile.id === id))
      .filter((profile): profile is ModelProfile => Boolean(profile));
  const serverProfiles = (() => {
    const resolved = resolveProfiles(storedProfileIds);
    if (resolved.length > 0) return resolved;
    if (storedProfileIds.length === 0) return [];
    const fallback =
      systemProfiles.find(
        (profile) =>
          settings && profile.id === settings.preferences.defaultProfileId,
      ) ?? systemProfiles[0];
    return fallback ? [fallback] : [];
  })();
  const selectedProfiles = pendingIds
    ? resolveProfiles(pendingIds)
    : serverProfiles;
  const selectedIds = selectedProfiles.map((profile) => profile.id);
  const modelLabel =
    selectedProfiles.length === 0
      ? dict.model.none
      : selectedProfiles.length === 1
        ? `${selectedProfiles[0].name} · ${selectedProfiles[0].model}`
        : format(dict.model.many, { count: selectedProfiles.length });
  function toggleProfile(id: string, checked: boolean) {
    const next = checked
      ? [...selectedIds, id]
      : selectedIds.filter((value) => value !== id);
    if (next.length > MAX_MODELS) {
      toast.error(format(dict.model.limit, { max: MAX_MODELS }));
      return;
    }
    const commit = () => {
      if (pendingRef.current?.join("\n") !== next.join("\n")) return;
      pendingRef.current = null;
      setPendingIds(null);
    };
    pendingRef.current = next;
    setPendingIds(next);
    void mutate({ action: "preferences", profileIds: next })
      .then(commit)
      .catch((error) => {
        commit();
        toast.error(error.message);
      });
  }
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
  const [multiResults, setMultiResults] = useState<ComparisonResult[] | null>(
    null,
  );
  const [bulkResults, setBulkResults] = useState<BulkRunResult[]>([]);

  const parsedState = useMemo(() => parseState(stateText), [stateText]);
  const bulkStates = useMemo(
    () => parseBulkStates(bulkText, delimiter),
    [bulkText, delimiter],
  );
  function clearResults() {
    setResult(null);
    setMultiResults(null);
    setBulkResults([]);
  }
  function applyPreset(name: string) {
    setPreset(name);
    if (name === "none") {
      setStateText("");
      setBulkText("");
      setDrafts([]);
      clearResults();
      return;
    }
    const found = PRESETS.find((p) => p.name === name);
    if (!found) return;
    setStateText(found.state);
    setDrafts(found.questions.map((q) => ({ ...q })));
    clearResults();
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
    profileId: string,
  ): Promise<EvaluateResponse> {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state,
        profileId,
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

  async function runBulk(
    questions: QuestionsMap,
    profiles: ModelProfile[],
  ) {
    const states = bulkStates;
    const answerOrder = drafts.map((d) => d.id);
    setBulkResults(
      profiles.map((profile) => ({
        profileId: profile.id,
        model: `${profile.name} · ${profile.model}`,
        questions,
        answerOrder,
        results: states.map((state) => ({
          state,
          status: "pending" as const,
          response: null,
          error: null,
        })),
      })),
    );
    setRunning(true);
    try {
      await Promise.all(
        profiles.map((profile, modelIndex) =>
          runBulkProfile(profile, modelIndex, questions, states),
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  function runBulkProfile(
    profile: ModelProfile,
    modelIndex: number,
    questions: QuestionsMap,
    states: JsonStructure[],
  ) {
    let cursor = 0;
    const update = (index: number, patch: Partial<BulkStateResult>) => {
      setBulkResults((prev) =>
        prev.map((entry, entryIndex) =>
          entryIndex === modelIndex
            ? {
                ...entry,
                results: entry.results.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, ...patch } : row,
                ),
              }
            : entry,
        ),
      );
    };
    const worker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= states.length) return;
        update(index, { status: "running" });
        try {
          const response = await evaluateOne(
            states[index],
            questions,
            profile.id,
          );
          update(index, { status: "done", response });
        } catch (error) {
          update(index, {
            status: "error",
            error: String((error as Error)?.message ?? error),
          });
        }
      }
    };
    return Promise.all(
      Array.from({ length: Math.min(BULK_CONCURRENCY, states.length) }, worker),
    );
  }

  async function run() {
    const validationError = validateDrafts(drafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const profiles = selectedProfiles;
    if (profiles.length === 0) {
      toast.error(dict.toasts.pickModel);
      return;
    }

    for (const profile of profiles) {
      const trimmedBaseUrl = profile.baseUrl.trim();
      if (trimmedBaseUrl) {
        try {
          new URL(trimmedBaseUrl);
        } catch {
          toast.error(dict.toasts.invalidUrl);
          return;
        }
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
      setResult(null);
      setMultiResults(null);
      await runBulk(questions, profiles);
      return;
    }

    if (parsedState === null) {
      toast.error(dict.toasts.stateEmpty);
      return;
    }

    setRunning(true);
    setBulkResults([]);
    try {
      if (profiles.length === 1) {
        setMultiResults(null);
        const profile = profiles[0];
        const response = await evaluateOne(parsedState, questions, profile.id);
        setResult({
          response,
          request: { state: parsedState, model: profile.model, questions },
          answerOrder: drafts.map((d) => d.id),
        });
      } else {
        setResult(null);
        setMultiResults(
          await Promise.all(
            profiles.map(async (profile) => {
              const request = {
                state: parsedState,
                model: profile.model,
                questions,
              };
              try {
                const response = await evaluateOne(
                  parsedState,
                  questions,
                  profile.id,
                );
                return {
                  profileId: profile.id,
                  name: profile.name,
                  request,
                  response,
                  error: null,
                };
              } catch (error) {
                const upstream = (error as { upstream?: unknown }).upstream;
                return {
                  profileId: profile.id,
                  name: profile.name,
                  request,
                  response: null,
                  error: `${String((error as Error)?.message ?? error)}${
                    upstream ? ` ${JSON.stringify(upstream)}` : ""
                  }`,
                };
              }
            }),
          ),
        );
      }
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-tour="playground-model"
                variant="outline"
                disabled={!settings || running}
                aria-label={dict.model.label}
                className="h-9 w-56 justify-between gap-2 px-3 font-mono text-xs"
              >
                <span className="truncate">{modelLabel}</span>
                <ChevronDown className="size-3.5 shrink-0 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {systemProfiles.length === 0 && (
                <DropdownMenuItem disabled>{dict.model.none}</DropdownMenuItem>
              )}
              {systemProfiles.map((profile) => {
                const checked = selectedIds.includes(profile.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={profile.id}
                    checked={checked}
                    disabled={!checked && selectedIds.length >= MAX_MODELS}
                    onCheckedChange={(value) =>
                      toggleProfile(profile.id, value === true)
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {profile.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {profile.model}
                      </span>
                    </span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            data-tour="playground-run"
            onClick={run}
            disabled={running || selectedProfiles.length === 0}
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
              {stateMode === "bulk" && bulkResults.length ? (
                <BulkAnswers bulkResults={bulkResults} running={running} />
              ) : stateMode === "bulk" ? (
                <EmptyAnswers text={dict.answers.empty} />
              ) : multiResults ? (
                <ResultsTable
                  title={dict.compare.title}
                  showState={false}
                  answerOrder={drafts.map((draft) => draft.id)}
                  rows={multiResults.map((result): ResultRow => {
                    const response = result.response;
                    return {
                      key: result.profileId,
                      model: result.name,
                      status: response ? "done" : "error",
                      error: result.error,
                      meta: response
                        ? {
                            model: response.model,
                            provider: response.provider,
                            latencyMs: response.latencyMs,
                            usage: response.usage,
                          }
                        : {},
                      answers: response?.answers ?? {},
                    };
                  })}
                />
              ) : !result ? (
                <EmptyAnswers text={dict.answers.empty} />
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
                    {stateMode === "bulk" && bulkResults.length
                      ? JSON.stringify(
                          bulkResults.map((entry) =>
                            entry.results.map((r) => ({
                              state: r.state,
                              model: entry.model,
                              questions: entry.questions,
                            })),
                          ),
                          null,
                          2,
                        )
                      : multiResults
                        ? JSON.stringify(
                            multiResults.map((entry) => entry.request),
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
                    {stateMode === "bulk" && bulkResults.length
                      ? JSON.stringify(
                          bulkResults.map((entry) =>
                            entry.results.map((r) => r.response ?? { error: r.error }),
                          ),
                          null,
                          2,
                        )
                      : multiResults
                        ? JSON.stringify(
                            multiResults.map(
                              (entry) => entry.response ?? { error: entry.error },
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
