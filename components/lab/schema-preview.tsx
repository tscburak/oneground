"use client";
import { useState } from "react";
import type { QuestionDraft } from "@/lib/typesafe";
import type { Evaluator } from "@/lib/lab/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useModelSettings } from "@/components/model-settings-provider";
import { evaluatorProfile } from "@/lib/model-settings-types";

export function SchemaPreview({
  drafts,
  evaluators,
  initialState,
  tr,
}: {
  drafts: QuestionDraft[];
  evaluators: Evaluator[];
  initialState: string | object;
  tr: boolean;
}) {
  const { settings } = useModelSettings();
  const options: Evaluator[] = [
    ...(settings?.models.map((profile) => ({
      id: `preview-${profile.id}`,
      rules: [],
      defaults: {},
      ...evaluatorProfile(profile),
    })) ?? []),
    ...evaluators.filter((e) => e.kind !== "cascade"),
  ];
  const [text, setText] = useState(
    typeof initialState === "string"
      ? initialState
      : JSON.stringify(initialState, null, 2),
  );
  const [id, setId] = useState(""),
    [result, setResult] = useState<unknown>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = options.find((option) => option.id === id) ?? options[0];
  return (
    <div className="space-y-3 border-t pt-4">
      <p className="font-medium">
        {tr ? "Örnek kayıt üzerinde dene" : "Preview on a sample record"}
      </p>
      <label className="grid gap-1 text-sm">
        State
        <Textarea
          className="font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        {tr ? "Motor" : "Evaluator"}
        <select
          className="h-9 rounded border bg-background px-2"
          value={selected?.id ?? ""}
          onChange={(e) => setId(e.target.value)}
        >
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="outline"
        disabled={busy || !text.trim() || !selected}
        onClick={async () => {
          setBusy(true);
          setError("");
          setResult(null);
          try {
            const state = /^[\[{]/.test(text.trim()) ? JSON.parse(text) : text;
            const response = await fetch("/api/lab", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "preview",
                drafts,
                evaluator: selected,
                state,
              }),
            });
            const value = await response.json();
            if (!response.ok) throw new Error(value.error);
            setResult(value);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? tr
            ? "Çalışıyor…"
            : "Running…"
          : tr
            ? "Şemayı dene · model seçiliyse API kullanır"
            : "Preview schema · model evaluators use API"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {result !== null && (
        <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
