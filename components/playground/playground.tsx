"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Play, Settings } from "lucide-react";
import { toast } from "sonner";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  buildQuestions,
  nextQuestionId,
  parseState,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_MODELS,
  validateDrafts,
  type EvaluateResponse,
  type JsonStructure,
  type Provider,
  type QuestionDraft,
  type QuestionsMap,
} from "@/lib/typesafe";

const CUSTOM_MODEL = "__custom__";

const PROVIDER_BASE_URL: Record<Provider, string> = {
  hosted: "https://api.typesafe.ai",
  local: "http://127.0.0.1:8008",
};

type RunResult = {
  response: EvaluateResponse;
  request: { state: JsonStructure; model: string; questions: QuestionsMap };
  answerOrder: string[];
};

function stateKind(state: JsonStructure): string {
  if (typeof state === "string") return "text";
  if (Array.isArray(state)) return "json array";
  return "json object";
}

export function Playground() {
  const [preset, setPreset] = useState<string>("none");
  const [provider, setProvider] = useState<Provider>("hosted");
  const [modelChoice, setModelChoice] = useState<string>(PROVIDER_DEFAULT_MODEL.hosted);
  const [customModel, setCustomModel] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDER_BASE_URL.hosted);
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [stateText, setStateText] = useState<string>(PRESETS[0].state);
  const [drafts, setDrafts] = useState<QuestionDraft[]>(PRESETS[0].questions);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const parsedState = useMemo(() => parseState(stateText), [stateText]);
  const model = modelChoice === CUSTOM_MODEL ? customModel.trim() : modelChoice;

  function applyProvider(next: Provider) {
    setProvider(next);
    setModelChoice(PROVIDER_DEFAULT_MODEL[next]);
    setCustomModel("");
    setBaseUrl(PROVIDER_BASE_URL[next]);
  }

  function applyPreset(name: string) {
    setPreset(name);
    if (name === "none") return;
    const found = PRESETS.find((p) => p.name === name);
    if (!found) return;
    setStateText(found.state);
    setDrafts(found.questions.map((q) => ({ ...q })));
    setResult(null);
  }

  function addDraft(kind: QuestionDraft["kind"]) {
    setDrafts((prev) => {
      const id = nextQuestionId(prev);
      if (kind === "noul") {
        return [...prev, { id, kind, instructions: "", trueCriteria: "", falseCriteria: "" }];
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

  async function run() {
    const validationError = validateDrafts(drafts);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (parsedState === null) {
      toast.error("State is empty.");
      return;
    }
    if (!model) {
      toast.error("Pick a model.");
      return;
    }

    const questions = buildQuestions(drafts);
    const request = { state: parsedState, model, questions };

    const trimmedBaseUrl = baseUrl.trim();
    if (trimmedBaseUrl) {
      try {
        new URL(trimmedBaseUrl);
      } catch {
        toast.error("API URL is not a valid URL.");
        return;
      }
    }

    setRunning(true);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...request,
          provider,
          model,
          baseUrl: trimmedBaseUrl,
          apiKey: apiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? `Request failed (${res.status})`, {
          description: data.upstream ? JSON.stringify(data.upstream, null, 2) : undefined,
        });
        return;
      }
      setResult({ response: data, request, answerOrder: drafts.map((d) => d.id) });
    } catch (error) {
      toast.error(String(error));
    } finally {
      setRunning(false);
    }
  }

  const modelOptions = PROVIDER_MODELS[provider];

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System One Playground</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send typed questions (noul, choice, score) over a state and visualize the judgments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger className="h-9 w-44" aria-label="Preset">
              <SelectValue placeholder="Preset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No preset</SelectItem>
              {PRESETS.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={provider} onValueChange={(v) => applyProvider(v as Provider)}>
            <SelectTrigger className="h-9 w-36" aria-label="Provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hosted">Jev (hosted)</SelectItem>
              <SelectItem value="local">Kev (local)</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={modelChoice}
            onValueChange={(v) => {
              setModelChoice(v);
              if (v !== CUSTOM_MODEL) setCustomModel("");
            }}
          >
            <SelectTrigger className="h-9 w-44" aria-label="Model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_MODEL}>Custom…</SelectItem>
            </SelectContent>
          </Select>
          {modelChoice === CUSTOM_MODEL && (
            <Input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="model id"
              className="h-9 w-36 font-mono text-xs"
            />
          )}
          <Button onClick={run} disabled={running} className="h-9">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="size-9" aria-label="Settings">
                <Settings className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
                <DialogDescription>
                  Endpoint and credentials for{" "}
                  {provider === "hosted" ? "Jev (hosted)" : "Kev (local)"}. Leave empty to use the
                  provider default or server environment.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-url">API URL</Label>
                  <Input
                    id="api-url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={PROVIDER_BASE_URL[provider]}
                    className="h-9 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Base origin without <code className="font-mono">/v1</code>. Default:{" "}
                    <code className="font-mono">{PROVIDER_BASE_URL[provider]}</code>
                    {provider === "local" && " (or server KEV_BASE_URL)"}.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-key">API key</Label>
                  <div className="relative">
                    <Input
                      id="api-key"
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        provider === "hosted" ? "sk-… (or server TYPESAFE_API_KEY)" : "not required for kev"
                      }
                      className="h-9 pr-10 font-mono text-xs"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    >
                      {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sent as a Bearer token by this app&apos;s server. Falls back to{" "}
                    <code className="font-mono">TYPESAFE_API_KEY</code> when empty.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>State</CardTitle>
                {parsedState !== null && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {stateKind(parsedState)}
                  </Badge>
                )}
              </div>
              <CardDescription>
                Text or JSON. JSON is parsed and sent as structured state; reference fields with
                backticked paths in instructions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={stateText}
                onChange={(e) => setStateText(e.target.value)}
                placeholder="The content to evaluate…"
                className="min-h-40 font-mono text-xs"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Questions</CardTitle>
                  <CardDescription className="mt-1.5">
                    Evaluated in parallel against the same state, each answered independently.
                  </CardDescription>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addDraft("noul")}>
                    + Noul
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addDraft("choice")}>
                    + Choice
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addDraft("score")}>
                    + Score
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {drafts.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No questions yet. Add a noul, choice, or score.
                </p>
              )}
              {drafts.map((draft, index) => (
                <QuestionEditor
                  key={index}
                  draft={draft}
                  onChange={(next) =>
                    setDrafts((prev) => prev.map((d, i) => (i === index ? next : d)))
                  }
                  onRemove={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          <Tabs defaultValue="answers">
            <TabsList>
              <TabsTrigger value="answers">Answers</TabsTrigger>
              <TabsTrigger value="request">Request JSON</TabsTrigger>
              <TabsTrigger value="response">Response JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="answers" className="mt-4 space-y-4">
              {!result && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <p className="text-sm text-muted-foreground">
                      Run an evaluation to see answers, probability distributions, and confidence.
                    </p>
                  </CardContent>
                </Card>
              )}
              {result && (
                <>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Model: </span>
                        <span className="font-mono">{result.response.model}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Latency: </span>
                        <span className="font-mono">{result.response.latencyMs} ms</span>
                      </div>
                      {result.response.usage && (
                        <div>
                          <span className="text-muted-foreground">Tokens: </span>
                          <span className="font-mono">
                            {result.response.usage.input_tokens ?? 0} in /{" "}
                            {result.response.usage.output_tokens ?? 0} out
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Provider: </span>
                        <span className="font-mono">{result.response.provider}</span>
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
                    {result
                      ? JSON.stringify(result.request, null, 2)
                      : "Run an evaluation to see the request payload."}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="response" className="mt-4">
              <Card>
                <CardContent className="py-0">
                  <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-xs leading-relaxed">
                    {result
                      ? JSON.stringify(result.response, null, 2)
                      : "Run an evaluation to see the raw response."}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Separator className="my-10" />
      <footer className="pb-8 text-xs text-muted-foreground">
        Requests proxy through this app&apos;s server route. API URL and key set above take
        precedence; otherwise <code className="font-mono">TYPESAFE_API_KEY</code> (hosted) and{" "}
        <code className="font-mono">KEV_BASE_URL</code> (local, default{" "}
        <code className="font-mono">http://127.0.0.1:8008</code>) come from the server
        environment. Both providers speak the same{" "}
        <code className="font-mono">/v1/systemone</code> contract.
      </footer>
    </div>
  );
}
