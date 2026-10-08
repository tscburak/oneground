"use client";

import { useEffect, useRef, useState } from "react";
import type { Driver, DriveStep } from "driver.js";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Step = [string, string, string, string, string];
const steps: Step[] = [
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
      "Modelleri seç",
      "Choose models",
      "Kayıtlı model profillerinden bir veya birden fazlasını seç. Birden çok model seçersen aynı girdi hepsinde çalışır ve sonuçlar yan yana karşılaştırılır.",
      "Select one or more saved model profiles. With several selected, the same input runs on all of them and results are compared side by side.",
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
];

export function GuidedTour({ tr }: { tr: boolean }) {
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
    [tr],
  );

  async function start() {
    const current = ++request.current;
    setLoading(true);
    try {
      const { driver } = await import("driver.js");
      if (request.current !== current) return;
      instance.current?.destroy();
      const visibleSteps: DriveStep[] = steps.flatMap(
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
