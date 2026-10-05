"use client";

import { useState } from "react";
import { ArrowRight, Check, Database, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { field } from "@/lib/lab/import";

type Mapping = { id: string; state: string; split: string; segment: string; labels: Record<string, string> };
type Props = {
  records: Record<string, unknown>[];
  fields: string[];
  format: string;
  mapping: Mapping;
  onChange: (mapping: Mapping) => void;
  questions: { id: string; instructions: string }[];
  tr: boolean;
};

function sample(value: unknown): string {
  if (value === undefined) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function DatasetMapping({ records, fields, format, mapping, onChange, questions, tr }: Props) {
  const t = (turkish: string, english: string) => tr ? turkish : english;
  const [row, setRow] = useState(0);
  const [active, setActive] = useState("state");
  const index = Math.min(row, Math.max(0, records.length - 1));
  const record = records[index];
  const targets = [
    { key: "state", title: t("Değerlendirilecek veri", "Input data"), description: t("Modelin okuyacağı metin veya JSON nesnesi. Tüm kayıt seçilirse etiketler de modele gönderilir.", "Text or JSON the model will read. Selecting the entire record also sends labels to the model."), fallback: t("Tüm kaydı kullan", "Use entire record") },
    { key: "id", title: t("Kayıt kimliği", "Record ID"), description: t("Her kaydı sonuçlarla ilişkilendiren benzersiz kimlik. Boşsa satır numarası kullanılır.", "Unique ID linking each record to its results. Defaults to the row number."), fallback: t("Satır numarasını kullan", "Use row number") },
    { key: "split", title: t("Veri bölümü", "Dataset split"), description: t("validation: ayarları denemek; test: son ölçüm. Alan yalnızca bu iki değeri içermeli.", "validation: tune settings; test: final measurement. Only these two values are accepted."), fallback: "validation" },
    { key: "segment", title: t("Segment / grup", "Segment / group"), description: t("Sonuçları konu, dil veya müşteri grubu gibi kategorilere göre karşılaştırır. İsteğe bağlıdır.", "Compare results by categories such as topic, language or customer group. Optional."), fallback: t("Grup kullanma", "No group") },
    ...questions.map(q => ({ key: `label:${q.id}`, title: `${t("Doğru cevap", "Expected answer")} · ${q.id}`, description: `${q.instructions ? `${q.instructions} — ` : ""}${t("Modelin cevabıyla karşılaştırılacak referans etiket. Metrikler için gereklidir; modele girdi olarak verilmemelidir.", "Reference label compared with the model answer. Required for metrics; keep it out of the model input.")}`, fallback: t("Etiket eşleme", "No label mapping") })),
  ];
  const selectedTarget = targets.find(target => target.key === active) ?? targets[0];
  const valueOf = (key: string) => key.startsWith("label:") ? mapping.labels[key.slice(6)] ?? "" : mapping[key as keyof Omit<Mapping, "labels">];
  const assign = (key: string, path: string) => onChange(key.startsWith("label:")
    ? { ...mapping, labels: { ...mapping.labels, [key.slice(6)]: path } }
    : { ...mapping, [key]: path });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("Önce sağdan bir hedef seçin, ardından soldan kaynak alana tıklayın. Eşlemeyi açılır listeden de yapabilirsiniz.", "Choose a target on the right, then click a source field on the left. You can also use the dropdowns.")}</p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="min-w-0 rounded-xl border bg-muted/20 p-4 lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Database className="size-4" />{t("Kaynak veri", "Source data")}</h3>
            <span className="rounded-md border bg-background px-2 py-1 text-xs font-medium">{format.toUpperCase()} · {records.length} {t("kayıt", "records")}</span>
          </div>
          <div className="my-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t("Örnek kayıt", "Sample record")} {records.length ? index + 1 : 0} / {records.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" aria-label={t("Önceki kayıt", "Previous record")} disabled={index === 0} onClick={() => setRow(index - 1)}><ChevronLeft className="size-4" /></Button>
              <Button variant="outline" size="icon" aria-label={t("Sonraki kayıt", "Next record")} disabled={index >= records.length - 1} onClick={() => setRow(index + 1)}><ChevronRight className="size-4" /></Button>
            </div>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{t("Tıklayarak eşle", "Click to map")} <ArrowRight className="inline size-3" /> <strong className="text-foreground">{selectedTarget.title}</strong></p>
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {fields.map(path => {
              const value = field(record, path);
              const selected = valueOf(selectedTarget.key) === path;
              const used = targets.filter(target => valueOf(target.key) === path);
              return <button key={path} type="button" aria-pressed={selected} onClick={() => assign(selectedTarget.key, path)} className={`w-full rounded-lg border p-3 text-left transition-colors hover:border-primary ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background"}`}>
                <div className="flex items-center justify-between gap-2"><code className="break-all text-xs font-semibold">{path}</code><span className="text-[10px] text-muted-foreground">{value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "undefined" ? t("eksik", "missing") : typeof value}</span></div>
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">{sample(value)}</pre>
                {used.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{used.map(target => <span key={target.key} className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[10px] text-primary"><Check className="size-3" />{target.title}</span>)}</div>}
              </button>;
            })}
          </div>
        </section>
        <section className="min-w-0 space-y-3" aria-label={t("Hedef alanlar", "Target fields")}>
          {targets.map(target => {
            const value = valueOf(target.key);
            const missing = !!value && !fields.includes(value);
            const resolved = value ? field(record, value) : target.key === "state" ? record : target.key === "id" ? index + 1 : target.key === "split" ? "validation" : undefined;
            return <div key={target.key} className={`rounded-xl border p-4 ${selectedTarget.key === target.key ? "border-primary bg-primary/5" : "bg-background"}`}>
              <button type="button" aria-pressed={selectedTarget.key === target.key} onClick={() => setActive(target.key)} className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold"><span>{target.title}</span><span className="text-xs font-normal text-primary">{selectedTarget.key === target.key ? t("Seçili hedef", "Selected target") : t("Hedefi seç", "Select target")}</span></button>
              <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">{target.description}</p>
              <select aria-label={target.key.startsWith("label:") ? `Label field ${target.key.slice(6)}` : `${target.key} field`} value={value} onFocus={() => setActive(target.key)} onChange={e => assign(target.key, e.target.value)} className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
                <option value="">{target.fallback}</option>
                {missing && <option value={value}>{t("Bulunamadı", "Not found")}: {value}</option>}
                {fields.map(path => <option key={path} value={path}>{path}</option>)}
              </select>
              <div className="mt-2 flex items-start gap-2 text-xs"><ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" /><pre className={`max-h-28 overflow-auto whitespace-pre-wrap break-all ${missing || (value && resolved === undefined) ? "text-destructive" : "text-muted-foreground"}`}>{missing ? t("Bu alan kaynak veride bulunamadı. Başka bir alan seçin.", "This field was not found in the source. Choose another field.") : sample(resolved)}</pre></div>
            </div>;
          })}
        </section>
      </div>
    </div>
  );
}
