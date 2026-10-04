"use client";

import { useEffect, useRef, useState } from "react";
import type { Driver, DriveStep } from "driver.js";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type TourSection =
  "playground" | "dataset" | "schema" | "experiment" | "results";
type Step = [string, string, string, string, string];
const steps: Record<TourSection, Step[]> = {
  playground: [
    [
      "playground-preset",
      "Bir örnekle başla",
      "Start with an example",
      "Hazır örneklerden birini seçerek state ve soruları birlikte doldurabilirsin.",
      "Choose a preset to fill the state and questions with a working example.",
    ],
    [
      "playground-state",
      "Değerlendirilecek veri",
      "Your input",
      "Tekil modda metin veya JSON gir. Bulk modunda birden fazla kaydı hızlıca dene.",
      "Enter text or JSON in Single mode. Switch to Bulk to try several records.",
    ],
    [
      "playground-questions",
      "Kararı tanımla",
      "Define the decision",
      "Noul evet olasılığını, Choice seçeneklerden birini, Score ise tanımladığın seviyeler arasında bir puanı döndürür.",
      "Noul returns P(yes), Choice selects an option, and Score rates the input against your levels.",
    ],
    [
      "playground-model",
      "Modeli seç",
      "Choose a model",
      "Veritabanına kaydedilmiş bir model profili seç. Ayarlar’dan model adı, bağlantı adresi ve API anahtarını düzenleyebilirsin.",
      "Choose a saved model profile. Settings lets you save the model name, endpoint and API key in the database.",
    ],
    [
      "playground-run",
      "Inference çalıştır",
      "Run inference",
      "Hazır olduğunda Çalıştır’a bas. Bu tur kendiliğinden API çağrısı yapmaz.",
      "Press Run when ready. This tutorial never starts an API call for you.",
    ],
    [
      "playground-results",
      "Cevapları incele",
      "Inspect the answers",
      "Sonuç, istek ve ham cevap sekmelerini incele. Etiketli toplu değerlendirme ve karşılaştırma için Evaluation Lab’e geç.",
      "Inspect results, request and raw response tabs. Use Evaluation Lab for labeled datasets and comparisons.",
    ],
  ],
  dataset: [
    [
      "dataset-import",
      "Dataset yükle",
      "Import a dataset",
      "CSV, JSON veya JSONL dosyası yükle ya da veriyi yapıştır. Örnek veriyle API kullanmadan başlayabilirsin.",
      "Upload CSV, JSON or JSONL, or paste records. The sample dataset lets you begin without an API call.",
    ],
    [
      "dataset-mapping",
      "Alanları eşle",
      "Map the fields",
      "State, kayıt ID’si, segment ve etiketleri alan yollarıyla bağla. Örneğin urgent → expected.urgent. Validation eşik seçimi, test ise son değerlendirme içindir.",
      "Map state, IDs, segments and labels using field paths, such as urgent → expected.urgent. Validation selects thresholds; test measures the chosen policy.",
    ],
    [
      "dataset-save",
      "Sürümü kaydet",
      "Save a version",
      "Önizleme ve hataları kontrol ettikten sonra dataset sürümünü kaydet. Kayıtlar sonraki deneylerde yeniden kullanılabilir.",
      "Check the preview and errors, then save an immutable dataset version for your experiments.",
    ],
    [
      "lab-tabs",
      "Sonraki adım: şema",
      "Next: decision schema",
      "Karar şeması sekmesinde bu kayıtlar için hangi soruların sorulacağını tanımla.",
      "Open Decision schema to define the questions evaluated on these records.",
    ],
  ],
  schema: [
    [
      "schema-builder",
      "Soruları oluştur",
      "Build questions",
      "Her soruya sabit bir ID ver. Bu ID dataset’teki etiket eşlemesiyle aynı olmalı. Sorunun anlamını ve olası cevaplarını açıkça yaz.",
      "Give each question a stable ID matching the dataset label mapping. Define the question and allowed answers clearly.",
    ],
    [
      "schema-json",
      "Önizle ve sürümle",
      "Preview and version",
      "Şemayı örnek bir kayıtta dene; JSON ile içe veya dışa aktar. Yeni sürüm kaydetmek geçmiş deneyleri değiştirmez.",
      "Preview a sample, import/export JSON, and save a new version. Existing experiments keep their original schema.",
    ],
    [
      "lab-tabs",
      "Sonraki adım: deney",
      "Next: experiment",
      "Deney oluştur sekmesinde dataset, şema ve karşılaştırılacak motorları seç.",
      "Open New experiment to choose the dataset, schema and evaluators.",
    ],
  ],
  experiment: [
    [
      "experiment-config",
      "Aynı veri, farklı motorlar",
      "Same data, different evaluators",
      "Dataset ve şema sürümünü seç. Rules, System One veya LLM ekle; model karşılaştırması için aynı türden birden fazla motor oluştur.",
      "Choose dataset and schema versions. Add Rules, System One or LLM evaluators; add multiple configurations to compare models.",
    ],
    [
      "experiment-add",
      "Baseline ve fallback",
      "Baselines and fallbacks",
      "Rules belirli koşulları uygular. Cascade, seçtiğin aşamaları sırayla çalıştırarak belirsiz sonuçlarda sonraki motora geçer.",
      "Rules provide a deterministic baseline. A cascade runs selected stages in order and escalates uncertain answers.",
    ],
    [
      "experiment-start",
      "Toplu değerlendirmeyi başlat",
      "Start the batch",
      "Worker çalışırken deney kuyruğa alınır ve tarayıcı kapansa da devam eder. Başlat düğmesi model seçiliyse API kullanır.",
      "With the worker running, jobs continue even if the browser closes. Starting a model evaluator uses its API.",
    ],
    [
      "lab-tabs",
      "Sonuçlara geç",
      "Open the results",
      "Analiz & replay sekmesinde ilerlemeyi, hataları ve motorlar arasındaki farkları incele.",
      "Open Analysis & replay to inspect progress, failures and evaluator differences.",
    ],
  ],
  results: [
    [
      "run-history",
      "Deney seç",
      "Choose an experiment",
      "Kaydedilmiş deneylerden birini seç. Sonuçlar dataset, şema ve motor ayarlarının çalıştırıldığı andaki sürümlerini saklar.",
      "Choose a saved experiment. It keeps snapshots of the dataset, schema and evaluator configuration.",
    ],
    [
      "analysis-filters",
      "Karşılaştırmanın kapsamı",
      "Set the analysis scope",
      "Soru, motor, validation/test bölümü ve segment filtreleri tüm metriklere uygulanır.",
      "Question, evaluator, split and segment filters apply to the analysis metrics.",
    ],
    [
      "threshold-tuning",
      "Eşiği veriden seç",
      "Tune on your data",
      "Slider’lar ham cevapları kullanır; yeniden inference yapmaz. Eşiği validation’da seç, başarıyı ayrı test kayıtlarında kontrol et.",
      "Sliders reuse raw answers without new inference. Choose thresholds on validation and check performance on separate test records.",
    ],
    [
      "confusion-matrix",
      "Hata örneklerine bak",
      "Inspect mistakes",
      "Satırlar gerçek, sütunlar tahmin edilen sınıflardır. Bir hücreye tıklayarak ilgili kayıtları açabilirsin. Coverage ve hata sayısını doğrulukla birlikte değerlendir.",
      "Rows are actual labels; columns are predictions. Click a cell to inspect its records. Read coverage and errors alongside accuracy.",
    ],
    [
      "model-comparison",
      "Motorları karşılaştır",
      "Compare evaluators",
      "Kalite, gecikme, token kullanımı ve varsa maliyeti aynı kayıtlar üzerinde karşılaştır. Anlaşmazlık filtresi farklı karar verilen örnekleri bulur.",
      "Compare quality, latency, tokens and available cost on the same records. The disagreement filter finds differing decisions.",
    ],
    [
      "replay",
      "Değişikliği tekrar oynat",
      "Replay a change",
      "Policy replay yeni eşikleri API çağrısı olmadan uygular. Inference replay modeli veya şemayı yeniden çalıştırır ve API kullanabilir.",
      "Policy replay applies new thresholds without API calls. Inference replay reruns the model or schema and may use its API.",
    ],
  ],
};

export function GuidedTour({
  section,
  tr,
}: {
  section: TourSection;
  tr: boolean;
}) {
  const instance = useRef<Driver | null>(null);
  const request = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  useEffect(
    () => () => {
      request.current++;
      instance.current?.destroy();
      instance.current = null;
    },
    [section, tr],
  );

  async function start() {
    const current = ++request.current;
    setLoading(true);
    try {
      const { driver } = await import("driver.js");
      if (request.current !== current) return;
      instance.current?.destroy();
      const visibleSteps: DriveStep[] = steps[section].flatMap(
        ([target, titleTr, titleEn, bodyTr, bodyEn]) => {
          const element = document.querySelector(`[data-tour="${target}"]`);
          if (!element || !element.getClientRects().length) return [];
          return [
            {
              element,
              popover: {
                title: tr ? titleTr : titleEn,
                description: tr ? bodyTr : bodyEn,
              },
            },
          ];
        },
      );
      instance.current = driver({
        steps: visibleSteps,
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        nextBtnText: tr ? "İleri" : "Next",
        prevBtnText: tr ? "Geri" : "Previous",
        doneBtnText: tr ? "Bitir" : "Done",
        popoverClass: "oneground-tour",
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        disableActiveInteraction: true,
        onPopoverRender: (popover) => {
          popover.closeButton.setAttribute(
            "aria-label",
            tr ? "Öğreticiyi kapat" : "Close tutorial",
          );
        },
        onDestroyed: () => {
          button.current?.focus({ preventScroll: true });
        },
      });
      instance.current.drive();
    } catch {
      if (request.current === current)
        toast.error(
          tr
            ? "Öğretici yüklenemedi. Tekrar deneyebilirsin."
            : "Could not load the tutorial. Please try again.",
        );
    } finally {
      if (request.current === current) setLoading(false);
    }
  }
  return (
    <Button
      ref={button}
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={() => void start()}
    >
      <CircleHelp className="size-4" />
      {tr ? "Öğretici" : "Tutorial"}
    </Button>
  );
}
