"use client";

import { useState } from "react";
import { Check, LoaderCircle, Play, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import type { ModelProfile } from "@/lib/model-settings-types";
import type { Judgment } from "@/lib/lab/types";
import { nextQuestionId, validateDrafts, type QuestionDraft } from "@/lib/typesafe";

type Result = {
  profileId: string;
  name: string;
  kind: "system-one" | "llm";
  configuredModel: string;
  resolvedModel: string;
  status: "done" | "error";
  answers?: Record<string, Judgment>;
  error?: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
};
type Comparison = {
  state: string;
  drafts: QuestionDraft[];
  results: Result[];
};

function firstQuestion(): QuestionDraft {
  return {
    id: "urgent",
    kind: "noul",
    instructions: "Does the message require urgent attention?",
    trueCriteria: "Explicit urgency or immediate action required.",
    falseCriteria: "No urgency.",
  };
}

function newQuestion(kind: QuestionDraft["kind"], id: string): QuestionDraft {
  if (kind === "noul")
    return { id, kind, instructions: "", trueCriteria: "", falseCriteria: "" };
  if (kind === "choice")
    return {
      id,
      kind,
      instructions: "",
      options: [
        { key: "option_a", description: "" },
        { key: "option_b", description: "" },
      ],
    };
  return { id, kind, instructions: "", levels: ["", ""] };
}

function answerText(
  answer: Judgment | undefined,
  question: QuestionDraft,
  tr: boolean,
) {
  if (!answer) return "—";
  const value =
    typeof answer.value === "boolean"
      ? answer.value
        ? tr
          ? "Evet"
          : "Yes"
        : tr
          ? "Hayır"
          : "No"
      : String(answer.value);
  if (question.kind === "noul" && answer.probability !== undefined)
    return `${value} · P(yes) ${(answer.probability * 100).toFixed(1)}%`;
  if (answer.confidence !== undefined)
    return `${value} · ${tr ? "güven" : "confidence"} ${(answer.confidence * 100).toFixed(1)}%`;
  return value;
}

export function ModelVsWorkspace({
  profiles,
  tr,
  onCompleted,
}: {
  profiles: ModelProfile[];
  tr: boolean;
  onCompleted: () => void;
}) {
  const t = (turkish: string, english: string) => (tr ? turkish : english);
  const [state, setState] = useState("Urgent: payment failed, fix it now");
  const [drafts, setDrafts] = useState<QuestionDraft[]>([firstQuestion()]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const validationError = validateDrafts(drafts);

  function addDraft(kind: QuestionDraft["kind"]) {
    setDrafts((current) => [...current, newQuestion(kind, nextQuestionId(current))]);
  }

  function toggleProfile(id: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? current.length < 6
          ? [...current, id]
          : current
        : current.filter((value) => value !== id),
    );
  }

  async function compare() {
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    setComparison(null);
    try {
      const response = await fetch("/api/model-vs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileIds: selected, state, drafts }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comparison failed.");
      setComparison({ state, drafts, results: data.results });
      onCompleted();
      toast.success(t("Karşılaştırma tamamlandı", "Model comparison finished"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <Badge variant="secondary" className="mb-3 gap-1.5">
            <Sparkles className="size-3.5" />
            {t("Tek girdi · çoklu karar", "One input · multiple decisions")}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("Modelleri karşılaştır", "Compare models")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Aynı girdiyi seçtiğiniz modellerde aynı karar sorularıyla çalıştırın. Cevapları ve performans metriklerini yan yana inceleyin.",
              "Run the same input and decision questions through selected models. Compare answers and performance side by side.",
            )}
          </p>
        </div>
        <Button
          data-tour="compare-run"
          size="lg"
          disabled={busy || selected.length < 2 || !state.trim() || !!validationError}
          onClick={() => void compare()}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
          {busy
            ? t("Karşılaştırılıyor…", "Comparing…")
            : t("Karşılaştırmayı çalıştır", "Run comparison")}
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Girdi", "Input")}</CardTitle>
              <CardDescription>
                {t("Her seçili model aynı state’i alır.", "Every selected model receives the same state.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                aria-label="Model vs state"
                className="min-h-32 resize-y font-mono text-sm"
                value={state}
                onChange={(event) => setState(event.target.value)}
                placeholder={t("Karşılaştırılacak metin veya state", "Text or state to compare")}
              />
            </CardContent>
          </Card>

          <Card data-tour="compare-config">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{t("Karar soruları", "Decision questions")}</CardTitle>
                <CardDescription className="mt-1">
                  {t("Her model aynı soru setine yanıt verir.", "Every model answers the same question set.")}
                </CardDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={drafts.length >= 25}>
                    <Plus /> {t("Karar ekle", "Add decision")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {([
                    ["noul", "Noul · Yes / No", "Binary decision"],
                    ["choice", "Choice · Select one", "Choose one option"],
                    ["score", "Score · Rating", "Rate against levels"],
                  ] as const).map(([kind, title, description]) => (
                    <DropdownMenuItem
                      key={kind}
                      className="flex-col items-start gap-0.5"
                      onSelect={() => addDraft(kind)}
                    >
                      <span className="font-medium">{title}</span>
                      <span className="text-xs text-muted-foreground">{description}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-3">
              {drafts.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("Karşılaştırmaya başlamak için karar ekleyin.", "Add a decision to start comparing.")}
                  </p>
                </div>
              )}
              {drafts.map((draft, index) => (
                <QuestionEditor
                  key={index}
                  draft={draft}
                  onChange={(next) =>
                    setDrafts((current) =>
                      current.map((question, i) => (i === index ? next : question)),
                    )
                  }
                  onRemove={() =>
                    setDrafts((current) => current.filter((_, i) => i !== index))
                  }
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <Card data-tour="compare-models" className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>{t("Modeller", "Models")}</CardTitle>
            <CardDescription>
              {t("En az iki, en fazla altı kayıtlı profil seçin.", "Choose 2–6 saved profiles.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profiles.length ? (
              profiles.map((profile) => {
                const checked = selected.includes(profile.id);
                return (
                  <label
                    key={profile.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select model ${profile.id}`}
                      checked={checked}
                      disabled={!checked && selected.length >= 6}
                      onChange={(event) => toggleProfile(profile.id, event.target.checked)}
                      className="mt-1 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <strong className="truncate text-sm">{profile.name}</strong>
                        {checked && <Check className="size-4 shrink-0 text-primary" />}
                      </span>
                      <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
                        {profile.model}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {profile.kind} · {profile.hasApiKey
                          ? t("API anahtarı kayıtlı", "API key saved")
                          : t("API anahtarı yok", "No API key")}
                      </span>
                    </span>
                  </label>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed p-5 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("Önce Ayarlar’da en az iki model profili oluşturun.", "Create at least two model profiles in Settings first.")}
                </p>
              </div>
            )}
            {selected.length < 2 && profiles.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Karşılaştırmak için bir model daha seçin.", "Select one more model to compare.")}
              </p>
            )}
            {error && (
              <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">
                {error}
              </p>
            )}
            {validationError && drafts.length > 0 && (
              <p role="status" className="text-xs text-muted-foreground">
                {validationError}
              </p>
            )}
            <Button
              className="w-full"
              disabled={busy || selected.length < 2 || !state.trim() || !!validationError}
              onClick={() => void compare()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
              {busy
                ? t(`Karşılaştırılıyor (${selected.length})…`, `Comparing ${selected.length} models…`)
                : t(`Karşılaştır (${selected.length} model)`, `Compare (${selected.length} models)`)}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t("Seçilen her model için API çağrısı yapılır.", "Makes one API call per selected model.")}
            </p>
          </CardContent>
        </Card>
      </div>

      {comparison && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{t("Karşılaştırma sonuçları", "Comparison results")}</CardTitle>
                <CardDescription className="mt-1 line-clamp-2">
                  {comparison.state}
                </CardDescription>
              </div>
              <Badge variant="outline">
                {comparison.results.filter((result) => result.status === "done").length}/
                {comparison.results.length} {t("model başarılı", "models succeeded")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Token kullanımı sağlayıcı bildirirse gösterilir. Tahmini maliyet için token fiyatı tanımlayın.", "Token usage appears when provided by the model API. Configure token prices for estimated cost.")}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-3 font-medium">{t("Model", "Model")}</th>
                    {comparison.drafts.map((draft) => (
                      <th key={draft.id} className="min-w-40 p-3 font-medium">
                        <span className="block">{draft.id}</span>
                        <span className="text-xs font-normal text-muted-foreground">{draft.kind}</span>
                      </th>
                    ))}
                    <th className="p-3 font-medium">{t("Durum", "Status")}</th>
                    <th className="p-3 font-medium">{t("Süre", "Latency")}</th>
                    <th className="p-3 font-medium">{t("Girdi / çıktı token", "Input / output tokens")}</th>
                    <th className="p-3 font-medium">{t("Toplam", "Total")}</th>
                    <th className="p-3 font-medium">{t("Tahmini maliyet", "Est. cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.results.map((result) => (
                    <tr key={result.profileId} className="border-b align-top last:border-0">
                      <td className="p-3">
                        <strong>{result.name}</strong>
                        <span className="block font-mono text-xs text-muted-foreground">{result.resolvedModel}</span>
                      </td>
                      {comparison.drafts.map((draft) => (
                        <td key={draft.id} className="p-3 font-medium">
                          {answerText(result.answers?.[draft.id], draft, tr)}
                        </td>
                      ))}
                      <td className="p-3">
                        {result.status === "done" ? t("Tamamlandı", "Done") : t("Hata", "Error")}
                        {result.error && <p className="max-w-56 whitespace-normal text-xs text-destructive">{result.error}</p>}
                      </td>
                      <td className="whitespace-nowrap p-3 tabular-nums">{result.latencyMs} ms</td>
                      <td className="whitespace-nowrap p-3 tabular-nums">{result.inputTokens ?? "—"} / {result.outputTokens ?? "—"}</td>
                      <td className="p-3 tabular-nums">{result.totalTokens ?? "—"}</td>
                      <td className="whitespace-nowrap p-3 tabular-nums">{result.costUsd === null ? "—" : `$${result.costUsd.toFixed(6)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
