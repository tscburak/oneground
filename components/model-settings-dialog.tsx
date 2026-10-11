"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Settings,
  Eye,
  EyeOff,
  Plus,
  SlidersHorizontal,
  Cpu,
  Palette,
  ListChecks,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useModelSettings } from "./model-settings-provider";
import { locales } from "@/lib/i18n";
import { useLocale } from "@/components/i18n";
import type { ModelProfile, Preferences } from "@/lib/model-settings-types";
import { QuestionEditor } from "@/components/playground/question-editor";
import {
  type QProfile,
} from "@/components/question-profile-dialogs";
import {
  nextQuestionId,
  validateDrafts,
  type QuestionDraft,
} from "@/lib/typesafe";

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  tr: "Türkçe",
};

type Draft = Omit<ModelProfile, "id" | "hasApiKey"> & {
  id?: string;
  hasApiKey: boolean;
};
const blank = (): Draft => ({
  name: "",
  kind: "system-one",
  model: "jev-latest",
  baseUrl: "https://api.typesafe.ai",
  prompt: "Apply the question definitions consistently.",
  inputPrice: null,
  outputPrice: null,
  hasApiKey: false,
});
export function ModelSettingsDialog({
  iconOnly = false,
}: {
  iconOnly?: boolean;
}) {
  const lang = useLocale(),
    tr = lang === "tr",
    t = (a: string, b: string) => (tr ? a : b);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const currentLang = lang === "tr" ? "tr" : "en";
  const { settings, error: loadError, mutate } = useModelSettings();
  const [section, setSection] = useState("defaults");
  const [qprofiles, setQprofiles] = useState<QProfile[]>([]);
  const [qEdit, setQEdit] = useState<{
    id?: string;
    name: string;
    drafts: QuestionDraft[];
  } | null>(null);
  const [qBusy, setQBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank),
    [apiKey, setApiKey] = useState(""),
    [clearKey, setClearKey] = useState(false),
    [showKey, setShowKey] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function edit(profile?: ModelProfile) {
    setDraft(profile ?? blank());
    setApiKey("");
    setClearKey(false);
    setShowKey(false);
    setError("");
  }
  async function refreshQProfiles() {
    try {
      const response = await fetch("/api/eval-lab/profiles", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Load failed.");
      setQprofiles(
        (Array.isArray(data) ? data : []).map((row) => {
          const entry = row as {
            id: unknown;
            name: unknown;
            createdAt: unknown;
            data: { drafts?: unknown };
          };
          return {
            id: String(entry.id),
            name: String(entry.name),
            createdAt: String(entry.createdAt),
            drafts: Array.isArray(entry.data?.drafts)
              ? (entry.data.drafts as QuestionDraft[]).map((draft) => ({
                  ...draft,
                }))
              : [],
          } satisfies QProfile;
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function editQProfile(entry?: QProfile) {
    setQEdit(
      entry
        ? {
            id: entry.id,
            name: entry.name,
            drafts: entry.drafts.map((draft) => ({ ...draft })),
          }
        : { name: "", drafts: [] },
    );
    setError("");
  }
  function addQDraft(kind: QuestionDraft["kind"]) {
    setQEdit((prev) => {
      if (!prev) return prev;
      const id = nextQuestionId(prev.drafts);
      if (kind === "noul")
        return {
          ...prev,
          drafts: [
            ...prev.drafts,
            { id, kind, instructions: "", trueCriteria: "", falseCriteria: "" },
          ],
        };
      if (kind === "choice")
        return {
          ...prev,
          drafts: [
            ...prev.drafts,
            {
              id,
              kind,
              instructions: "",
              options: [
                { key: "option_a", description: "" },
                { key: "option_b", description: "" },
              ],
            },
          ],
        };
      return {
        ...prev,
        drafts: [...prev.drafts, { id, kind, instructions: "", levels: ["", ""] }],
      };
    });
  }
  async function saveQProfile() {
    if (!qEdit) return;
    const validationError = validateDrafts(qEdit.drafts);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!qEdit.name.trim()) {
      setError(t("Profil adı gerekli", "Profile name is required"));
      return;
    }
    setQBusy(true);
    setError("");
    try {
      const response = await fetch("/api/eval-lab/profiles", {
        method: qEdit.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          qEdit.id
            ? {
                id: qEdit.id,
                name: qEdit.name.trim(),
                data: { drafts: qEdit.drafts },
              }
            : { name: qEdit.name.trim(), data: { drafts: qEdit.drafts } },
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Save failed.");
      await refreshQProfiles();
      setQEdit(null);
      toast.success(t("Soru profili kaydedildi", "Question profile saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setQBusy(false);
    }
  }
  async function deleteQProfile() {
    if (!qEdit?.id) return;
    setQBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/eval-lab/profiles?id=${encodeURIComponent(qEdit.id)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Delete failed.");
      await refreshQProfiles();
      setQEdit(null);
      toast.success(t("Soru profili silindi", "Question profile deleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setQBusy(false);
    }
  }
  async function updatePreferences(change: Partial<Preferences>) {
    setBusy(true);
    setError("");
    try {
      await mutate({ action: "preferences", ...change });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const data = await mutate({
        action: "save-model",
        ...draft,
        hasApiKey: undefined,
        apiKey: apiKey || undefined,
        clearApiKey: clearKey,
      });
      edit(data.models.find((profile) => profile.id === data.savedProfileId));
      toast.success(
        t("Model ve ayarlar kaydedildi", "Model and settings saved"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          setSection("defaults");
          edit(
            settings?.models.find(
              (profile) => profile.id === settings.preferences.defaultProfileId,
            ),
          );
          setQEdit(null);
          void refreshQProfiles();
        } else {
          setApiKey("");
          setShowKey(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={iconOnly ? "icon" : "sm"}
          aria-label={t("Ayarlar", "Settings")}
          className={iconOnly ? "size-9" : undefined}
        >
          <Settings className="size-4" />
          {!iconOnly && t("Ayarlar", "Settings")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(760px,90dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <DialogTitle>{t("Ayarlar", "Settings")}</DialogTitle>
          <DialogDescription>
            {t(
              "Çalışma tercihlerini ve modellerini yönet.",
              "Manage your workspace preferences and models.",
            )}
          </DialogDescription>
        </DialogHeader>
        {(error || loadError) && (
          <p role="alert" className="px-6 pt-4 text-sm text-red-600">
            {error || loadError}
          </p>
        )}
        {!settings ? (
          <p>{t("Ayarlar yükleniyor…", "Loading settings…")}</p>
        ) : (
          <Tabs
            value={section}
            onValueChange={setSection}
            orientation="vertical"
            className="min-h-0 flex-1 flex-col gap-0 sm:flex-row"
          >
            <TabsList
              aria-label={t("Ayar bölümleri", "Settings sections")}
              className="h-auto! w-full shrink-0 flex-row justify-start rounded-none border-b bg-muted/30 p-3 sm:w-52 sm:flex-col sm:items-stretch sm:justify-start sm:h-full! sm:self-stretch sm:border-b-0 sm:border-r"
            >
              <TabsTrigger value="defaults" className="h-9 flex-none px-3">
                <SlidersHorizontal />
                {t("Varsayılan değerler", "Defaults")}
              </TabsTrigger>
              <TabsTrigger value="models" className="h-9 flex-none px-3">
                <Cpu />
                {t("Modeller", "Models")}
              </TabsTrigger>
              <TabsTrigger value="questions" className="h-9 flex-none px-3">
                <ListChecks />
                {t("Sorular", "Questions")}
              </TabsTrigger>
              <TabsTrigger value="preferences" className="h-9 flex-none px-3">
                <Palette />
                {t("Tercihler", "Preferences")}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="models"
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <ScrollArea className="h-full" type="auto">
                <div className="space-y-5 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{t("Modeller", "Models")}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "Kayıtlı modellerini düzenle veya yeni bir model ekle.",
                          "Edit your saved models or add a new one.",
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => edit()}
                    >
                      <Plus className="size-4" />
                      {t("Yeni", "New")}
                    </Button>
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    aria-label={t("Kayıtlı modeller", "Saved models")}
                  >
                    {settings.models.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        disabled={busy}
                        aria-pressed={draft.id === profile.id}
                        onClick={() => edit(profile)}
                        className="min-w-0 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted aria-pressed:border-foreground/30 aria-pressed:bg-muted disabled:opacity-50"
                      >
                        <span className="block text-sm font-medium break-all">
                          {profile.name}
                        </span>
                        <span className="block text-xs text-muted-foreground break-all">
                          {profile.model}
                        </span>
                      </button>
                    ))}
                    {!settings.models.length && (
                      <p className="text-sm text-muted-foreground">
                        {t("Henüz model eklenmedi.", "No models added yet.")}
                      </p>
                    )}
                  </div>
                  <fieldset
                    disabled={busy}
                    className="min-w-0 space-y-4 border-t pt-5"
                  >
                    <legend className="sr-only">
                      {draft.id
                        ? t("Modeli düzenle", "Edit model")
                        : t("Yeni model", "New model")}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        {t("Profil adı", "Profile name")}
                        <Input
                          value={draft.name}
                          onChange={(e) =>
                            setDraft({ ...draft, name: e.target.value })
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        {t("Motor türü", "Evaluator type")}
                        <select
                          className="h-9 rounded border bg-background px-2"
                          value={draft.kind}
                          onChange={(e) => {
                            const kind = e.target.value as Draft["kind"];
                            setDraft({
                              ...draft,
                              kind,
                              model: kind === "system-one" ? "jev-latest" : "",
                              baseUrl:
                                kind === "system-one"
                                  ? "https://api.typesafe.ai"
                                  : "https://api.openai.com/v1",
                            });
                          }}
                        >
                          <option value="system-one">System One</option>
                          <option value="llm">LLM</option>
                        </select>
                      </label>
                    </div>
                    <label className="grid gap-1 text-sm">
                      Model
                      <Input
                        value={draft.model}
                        onChange={(e) =>
                          setDraft({ ...draft, model: e.target.value })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      API URL
                      <Input
                        value={draft.baseUrl}
                        onChange={(e) =>
                          setDraft({ ...draft, baseUrl: e.target.value })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      {t("API anahtarı", "API key")}
                      <div className="relative">
                        <Input
                          type={showKey ? "text" : "password"}
                          className="pr-10"
                          autoComplete="new-password"
                          value={apiKey}
                          placeholder={
                            draft.hasApiKey && !clearKey
                              ? t(
                                  "Kayıtlı · değiştirmek için yeni anahtar gir",
                                  "Saved · enter a new key to replace",
                                )
                              : t("İsteğe bağlı", "Optional")
                          }
                          onChange={(e) => {
                            setApiKey(e.target.value);
                            setClearKey(false);
                          }}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="absolute right-0 top-0 h-9 w-9"
                          aria-label={
                            showKey
                              ? t("Yeni anahtarı gizle", "Hide new key")
                              : t("Yeni anahtarı göster", "Show new key")
                          }
                          onClick={() => setShowKey(!showKey)}
                        >
                          {showKey ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                    </label>
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        {clearKey
                          ? t(
                              "Kaydettiğinde anahtar silinecek",
                              "Key will be cleared when you save",
                            )
                          : draft.hasApiKey
                            ? t("API anahtarı kayıtlı", "API key saved")
                            : t("API anahtarı yok", "No API key")}
                      </span>
                      {draft.hasApiKey && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setClearKey(!clearKey);
                            setApiKey("");
                          }}
                        >
                          {clearKey
                            ? t("Silmekten vazgeç", "Keep key")
                            : t("Anahtarı sil", "Clear key")}
                        </Button>
                      )}
                    </div>
                    {draft.kind === "llm" && (
                      <label className="grid gap-1 text-sm">
                        Prompt
                        <Textarea
                          value={draft.prompt}
                          onChange={(e) =>
                            setDraft({ ...draft, prompt: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <details className="rounded-lg border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        {t("Gelişmiş ayarlar", "Advanced settings")}
                      </summary>
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(["inputPrice", "outputPrice"] as const).map(
                            (key) => (
                              <label key={key} className="grid gap-1 text-sm">
                                {key} · USD / 1M tokens
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft[key] ?? ""}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      [key]:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                            ),
                          )}
                        </div>
                      </div>
                    </details>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={
                          busy || !draft.name.trim() || !draft.model.trim()
                        }
                        onClick={() => void save()}
                      >
                        {t("Modeli kaydet", "Save model")}
                      </Button>
                      {draft.id && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await mutate({
                                action: "delete-model",
                                id: draft.id,
                              });
                              edit();
                            } catch (e) {
                              setError(String(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {t("Modeli sil", "Delete model")}
                        </Button>
                      )}
                    </div>
                  </fieldset>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "API anahtarları güvenle saklanır ve tarayıcıya geri gönderilmez.",
                      "API keys are stored securely and never returned to the browser.",
                    )}
                  </p>
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent
              value="questions"
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <ScrollArea className="h-full" type="auto">
                <div className="space-y-5 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">
                        {t("Soru profilleri", "Question profiles")}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "Playground ve Eval Lab ortak soru profillerini düzenle veya yeni profil ekle.",
                          "Edit the question profiles shared by Playground and Eval Lab, or add a new one.",
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={qBusy}
                      onClick={() => editQProfile()}
                    >
                      <Plus className="size-4" />
                      {t("Yeni", "New")}
                    </Button>
                  </div>
                  <div
                    className="space-y-2"
                    aria-label={t("Kayıtlı soru profilleri", "Saved question profiles")}
                  >
                    {qprofiles.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {entry.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {tr
                              ? `${entry.drafts.length} soru`
                              : `${entry.drafts.length} questions`}
                            {" · "}
                            {new Date(entry.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={qBusy}
                          aria-label={`${t("Profili düzenle", "Edit profile")} ${entry.name}`}
                          onClick={() => editQProfile(entry)}
                        >
                          {t("Düzenle", "Edit")}
                        </Button>
                      </div>
                    ))}
                    {!qprofiles.length && (
                      <p className="text-sm text-muted-foreground">
                        {t("Henüz soru profili yok.", "No question profiles yet.")}
                      </p>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
            <Dialog
              open={qEdit !== null}
              onOpenChange={(open) => {
                if (!open) setQEdit(null);
              }}
            >
              <DialogContent
                className="sm:max-w-2xl"
                aria-label={
                  qEdit?.id
                    ? t("Soru profilini düzenle", "Edit question profile")
                    : t("Yeni soru profili", "New question profile")
                }
              >
                <DialogHeader>
                  <DialogTitle>
                    {qEdit?.id
                      ? t("Soru profilini düzenle", "Edit question profile")
                      : t("Yeni soru profili", "New question profile")}
                  </DialogTitle>
                </DialogHeader>
                {qEdit && (
                  <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
                    <label className="grid gap-1 text-sm">
                      {t("Profil adı", "Profile name")}
                      <Input
                        value={qEdit.name}
                        onChange={(e) =>
                          setQEdit({ ...qEdit, name: e.target.value })
                        }
                      />
                    </label>
                    <div className="space-y-3">
                      {qEdit.drafts.map((draft, index) => (
                        <QuestionEditor
                          key={index}
                          draft={draft}
                          onChange={(next) =>
                            setQEdit((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    drafts: prev.drafts.map((d, i) =>
                                      i === index ? next : d,
                                    ),
                                  }
                                : prev,
                            )
                          }
                          onRemove={() =>
                            setQEdit((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    drafts: prev.drafts.filter(
                                      (_, i) => i !== index,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                      ))}
                      {!qEdit.drafts.length && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          {t(
                            "Henüz soru yok. Bir noul, choice veya score ekle.",
                            "No questions yet. Add a noul, choice, or score.",
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["noul", "choice", "score"] as const).map((kind) => (
                        <Button
                          key={kind}
                          variant="outline"
                          size="sm"
                          onClick={() => addQDraft(kind)}
                        >
                          <Plus className="size-3" /> {kind}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <div>
                    {qEdit?.id && (
                      <Button
                        variant="outline"
                        disabled={qBusy}
                        onClick={() => void deleteQProfile()}
                      >
                        <Trash2 className="size-4" />
                        {t("Profili sil", "Delete profile")}
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setQEdit(null)}
                    >
                      {t("Kapat", "Close")}
                    </Button>
                    <Button
                      disabled={qBusy || !qEdit?.name.trim()}
                      onClick={() => void saveQProfile()}
                    >
                      {t("Profili kaydet", "Save profile")}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <TabsContent
              value="defaults"
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <ScrollArea className="h-full" type="auto">
                <div className="space-y-5 p-6">
                  <div>
                    <h3 className="font-medium">
                      {t("Varsayılan değerler", "Defaults")}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "Playground için varsayılan model, girdi modu ve ayırıcı değerlerini güncelle.",
                        "Update the default model, input mode and delimiter for Playground.",
                      )}
                    </p>
                  </div>
                  <label className="grid gap-2 text-sm">
                    {t(
                      "Varsayılan Playground modeli",
                      "Default Playground model",
                    )}
                    <select
                      className="h-9 rounded border bg-background px-2"
                      value={settings.preferences.defaultProfileId}
                      disabled={busy}
                      onChange={async (e) => {
                        setBusy(true);
                        try {
                          await mutate({
                            action: "preferences",
                            defaultProfileId: e.target.value,
                          });
                        } catch (error) {
                          setError(String(error));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <option value="" disabled>
                        {t("Model seç", "Select model")}
                      </option>
                      {settings.models
                        .filter((profile) => profile.kind === "system-one")
                        .map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    {t("Girdi modu", "Input mode")}
                    <select
                      className="h-9 rounded border bg-background px-2"
                      disabled={busy}
                      value={settings.preferences.stateMode}
                      onChange={(e) =>
                        void updatePreferences({
                          stateMode: e.target.value as Preferences["stateMode"],
                        })
                      }
                    >
                      <option value="single">{t("Tekli", "Single")}</option>
                      <option value="bulk">{t("Toplu", "Bulk")}</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    {t("Toplu girdi ayırıcı", "Bulk input delimiter")}
                    <select
                      className="h-9 rounded border bg-background px-2"
                      disabled={busy}
                      value={settings.preferences.delimiter}
                      onChange={(e) =>
                        void updatePreferences({
                          delimiter: e.target.value as Preferences["delimiter"],
                        })
                      }
                    >
                      <option value="newline">
                        {t("Yeni satır", "Newline")}
                      </option>
                      <option value="comma">{t("Virgül", "Comma")}</option>
                      <option value="semicolon">
                        {t("Noktalı virgül", "Semicolon")}
                      </option>
                      <option value="tab">{t("Sekme", "Tab")}</option>
                      <option value="jsonl">JSONL</option>
                    </select>
                  </label>
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent
              value="preferences"
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <ScrollArea className="h-full" type="auto">
                <div className="space-y-5 p-6">
                  <div>
                    <h3 className="font-medium">
                      {t("Tercihler", "Preferences")}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "Tema ve dil ayarlarını yönet.",
                        "Manage theme and language settings.",
                      )}
                    </p>
                  </div>
                  <label className="grid gap-2 text-sm">
                    {t("Tema", "Theme")}
                    <select
                      className="h-9 rounded border bg-background px-2"
                      value={theme || "system"}
                      onChange={(e) => setTheme(e.target.value)}
                    >
                      <option value="light">{t("Açık", "Light")}</option>
                      <option value="dark">{t("Koyu", "Dark")}</option>
                      <option value="system">{t("Sistem", "System")}</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    {t("Dil", "Language")}
                    <select
                      className="h-9 rounded border bg-background px-2"
                      value={currentLang}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === currentLang) return;
                        setBusy(true);
                        setError("");
                        mutate({
                          action: "preferences",
                          locale: v,
                        })
                          .then(() => router.refresh())
                          .catch((error) =>
                            setError(
                              error instanceof Error
                                ? error.message
                                : String(error),
                            ),
                          )
                          .finally(() => setBusy(false));
                      }}
                    >
                      {locales.map((locale) => (
                        <option key={locale} value={locale}>
                          {LOCALE_NAMES[locale]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
