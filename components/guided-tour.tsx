"use client";

import { useEffect, useRef, useState } from "react";
import type { Driver, DriveStep } from "driver.js";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type TourSection = "playground" | "compare";
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
      "Sonuç, istek ve ham cevap sekmelerini incele.",
      "Inspect results, request and raw response tabs.",
    ],
  ],
  compare: [
    [
      "compare-config",
      "Tek girdide karşılaştır",
      "Compare on one input",
      "Tek bir state ve karar sorusu gir. Model karşılaştırması için dataset hazırlaman gerekmez.",
      "Enter one state and decision question. No dataset setup needed for a model comparison.",
    ],
    [
      "compare-models",
      "Modelleri seç",
      "Choose models",
      "Ayarlar’da kayıtlı profillerden en az iki model seç. Aynı girdiyi eşzamanlı karşılaştırırlar.",
      "Select at least two saved model profiles. They receive the same input for a side-by-side comparison.",
    ],
    [
      "compare-run",
      "Karşılaştırmayı çalıştır",
      "Run the comparison",
      "Noul, Choice veya Score sorusunu seç. Yanıt, süre, token kullanımı ve varsa tahmini maliyet sonuçlarda görünür.",
      "Choose Noul, Choice or Score. Results show answers, latency, token usage and estimated cost when available.",
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
