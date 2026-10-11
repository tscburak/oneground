"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SNIPPET_LANGUAGES,
  getSnippet,
  safeEndpoint,
  type SnippetLanguage,
  type SnippetPayload,
} from "@/lib/code-snippets";
import type { ModelProfile } from "@/lib/model-settings-types";
import type { JsonStructure, QuestionsMap } from "@/lib/typesafe";

export function RequestViewer({
  profiles,
  stateMode,
  liveState,
  bulkStates,
  liveQuestions,
  executedJson,
}: {
  profiles: ModelProfile[];
  stateMode: "single" | "bulk";
  liveState: JsonStructure | null;
  bulkStates: JsonStructure[];
  liveQuestions: QuestionsMap;
  executedJson: string | null;
}) {
  const dict = useI18n();
  const code = dict.code ?? {};
  const [profileId, setProfileId] = useState<string | null>(null);
  const [language, setLanguage] = useState<SnippetLanguage>("json");
  const [copied, setCopied] = useState(false);

  const activeProfile = useMemo<ModelProfile | null>(() => {
    if (profiles.length === 0) return null;
    return profiles.find((p) => p.id === profileId) ?? profiles[0];
  }, [profiles, profileId]);

  const livePayload = useMemo<SnippetPayload | null>(() => {
    if (!activeProfile) return null;
    if (Object.keys(liveQuestions).length === 0) return null;
    if (stateMode === "single") {
      if (liveState === null) return null;
      return {
        state: liveState,
        model: activeProfile.model,
        questions: liveQuestions,
      };
    }
    if (bulkStates.length === 0) return null;
    return {
      state: bulkStates[0],
      model: activeProfile.model,
      questions: liveQuestions,
    };
  }, [activeProfile, liveQuestions, liveState, bulkStates, stateMode]);

  const endpointUrl = activeProfile ? safeEndpoint(activeProfile.baseUrl) : null;

  const snippet = useMemo(() => {
    if (!livePayload || !endpointUrl) return null;
    try {
      return getSnippet(language, endpointUrl, livePayload);
    } catch {
      return null;
    }
  }, [livePayload, endpointUrl, language]);

  async function copy() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      const el = document.createElement("textarea");
      el.value = snippet;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (profiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {code.noModel ?? dict.toasts.pickModel}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={activeProfile?.id ?? ""}
            onValueChange={(v) => setProfileId(v)}
          >
            <SelectTrigger
              className="h-8 min-w-44 flex-1 font-mono text-xs"
              aria-label={code.model ?? dict.model.label}
            >
              <SelectValue
                placeholder={code.model ?? dict.model.label}
              />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={language}
            onValueChange={(v) => setLanguage(v as SnippetLanguage)}
          >
            <SelectTrigger
              className="h-8 w-36 text-xs"
              aria-label={code.language ?? "Language"}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SNIPPET_LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!snippet}
            onClick={copy}
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
            {copied
              ? (code.copied ?? "Copied")
              : (code.copy ?? "Copy")}
          </Button>
        </div>

        {endpointUrl && activeProfile && (
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            POST {endpointUrl} · {activeProfile.model}
          </p>
        )}
        {stateMode === "bulk" && bulkStates.length > 1 && (
          <p className="text-[11px] text-muted-foreground">
            {code.bulkNote ??
              "Bulk mode sends one request per state — showing the first state."}
          </p>
        )}

        <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/50 p-4 font-mono text-xs leading-relaxed">
          {snippet ??
            (code.liveEmpty ?? dict.answers.requestEmpty)}
        </pre>

        {executedJson && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {code.lastRun ?? "Last run"}
            </summary>
            <pre className="mt-2 max-h-[40vh] overflow-auto rounded-md bg-muted/50 p-4 font-mono text-xs leading-relaxed">
              {executedJson}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
