"use client";

import { useEffect, useRef, useState } from "react";
import type { Driver, DriveStep } from "driver.js";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Step = [string, string, string, string, string];
const playgroundSteps: Step[] = [
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
      "playground-profiles",
      "Kayıtlı profili yükle",
      "Load a saved profile",
      "Eval Lab veya Ayarlar'da kaydedilen soru profilleri burada listelenir. Yükleme mevcut soruları değiştirir.",
      "Question profiles saved in Eval Lab or Settings are listed here. Loading replaces the current questions.",
    ],
    [
      "playground-profiles",
      "Soruları kaydet",
      "Save the questions",
      "Mevcut soruları adlandırıp profil olarak kaydet; Eval Lab'de yeniden kullan.",
      "Name the current questions and save them as a profile to reuse in Eval Lab.",
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

type EvalStep = {
  target: string;
  wizard: number;
  titleTr: string;
  titleEn: string;
  bodyTr: string;
  bodyEn: string;
};
const evalSteps: EvalStep[] = [
  {
    target: "eval-stepper",
    wizard: 0,
    titleTr: "Adımları izle",
    titleEn: "Follow the steps",
    bodyTr: "Beş adım seni sorulardan karşılaştırılmış sonuçlara götürür. Geri dönebilirsin; ileri gitmek mevcut adımın bitmesini ister.",
    bodyEn: "Five steps take you from questions to compared results. You can always go back; moving forward needs the current step finished.",
  },
  {
    target: "eval-questions",
    wizard: 0,
    titleTr: "Soruları seç",
    titleEn: "Pick the questions",
    bodyTr: "Kayıtlı bir profili yükle ya da noul, choice, score sorularını elle ekle. Aynı profiller Playground'da da geçerli.",
    bodyEn: "Load a saved profile or add noul, choice, score questions manually. The same profiles work in Playground.",
  },
  {
    target: "eval-dataset",
    wizard: 1,
    titleTr: "Veri setini bırak",
    titleEn: "Drop the dataset",
    bodyTr: "Dosyayı sürükleyip bırak ya da manuel gir ve biçimi seç. Devam, veriyi ayrıştırıp önizlemeye geçirir.",
    bodyEn: "Drag & drop a file or paste manually and pick the format. Continue parses the data into the preview.",
  },
  {
    target: "eval-preview",
    wizard: 2,
    titleTr: "Önizlemeyi kontrol et",
    titleEn: "Check the preview",
    bodyTr: "İlk 20 satır ve algılanan sütunlar. Yanlış görünüyorsa geri dönüp girdiyi ya da biçimi düzelt.",
    bodyEn: "The first 20 rows and detected columns. If it looks wrong, go back and fix the input or format.",
  },
  {
    target: "eval-matching",
    wizard: 3,
    titleTr: "Sütunları eşle",
    titleEn: "Match the columns",
    bodyTr: "Her soruyu doğru yanıtı tutan sütuna bağla. Durum sütunu modele gider; etiketler asla girdiye verilmez.",
    bodyEn: "Point each question at its expected-answer column. The state column feeds the model; labels never do.",
  },
  {
    target: "eval-run",
    wizard: 4,
    titleTr: "Çalıştır ve karşılaştır",
    titleEn: "Run and compare",
    bodyTr: "Aynı ilk 10 satır seçili her modelde çalışır. Doğruluk, beklenen yanıtlarla birebir eşleşmeyi sayar. Bu tur API çağrısı yapmaz.",
    bodyEn: "The same first 10 rows run on every selected model. Accuracy counts exact matches. This tutorial never starts an API call for you.",
  },
];

function gotoWizard(step: number) {
  window.dispatchEvent(new CustomEvent("oneground:eval-goto", { detail: step }));
}

export function GuidedTour({
  tr,
  section = "playground",
}: {
  tr: boolean;
  section?: string;
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
    [tr, section],
  );

  async function start() {
    const current = ++request.current;
    setLoading(true);
    try {
      const { driver } = await import("driver.js");
      if (request.current !== current) return;
      instance.current?.destroy();
      const isEval = section === "eval-lab";
      if (isEval) gotoWizard(0);
      // Let the wizard render the requested step before querying targets.
      await new Promise((resolve) => setTimeout(resolve, isEval ? 140 : 0));
      if (request.current !== current) return;
      const toDriveStep = (
        target: string,
        titleTr: string,
        titleEn: string,
        bodyTr: string,
        bodyEn: string,
        nav?: {
          onNext?: () => void;
          onPrev?: () => void;
        },
        asSelector?: boolean,
      ): DriveStep[] => {
        if (asSelector) {
          // Eval steps render on demand as the wizard advances; a selector
          // lets the driver resolve the target fresh on every move.
          return [
            {
              element: `[data-tour="${target}"]`,
              popover: {
                title: tr ? titleTr : titleEn,
                description: tr ? bodyTr : bodyEn,
                ...(nav?.onNext ? { onNextClick: () => nav.onNext?.() } : {}),
                ...(nav?.onPrev ? { onPrevClick: () => nav.onPrev?.() } : {}),
              },
            },
          ];
        }
        const element = document.querySelector(`[data-tour="${target}"]`);
        if (!element || !element.getClientRects().length) return [];
        const popover: DriveStep["popover"] = {
          title: tr ? titleTr : titleEn,
          description: tr ? bodyTr : bodyEn,
        };
        if (nav?.onNext)
          popover.onNextClick = () => {
            nav.onNext?.();
          };
        if (nav?.onPrev)
          popover.onPrevClick = () => {
            nav.onPrev?.();
          };
        return [{ element, popover }];
      };
      const stepAfter = (ms: number, fn: () => void) =>
        window.setTimeout(() => {
          if (request.current !== current) return;
          fn();
        }, ms);
      let visibleSteps: DriveStep[];
      if (isEval) {
        visibleSteps = evalSteps.flatMap((step, index) => {
          const nav: { onNext?: () => void; onPrev?: () => void } = {};
          if (index < evalSteps.length - 1) {
            const wizard = evalSteps[index + 1].wizard;
            nav.onNext = () => {
              gotoWizard(wizard);
              stepAfter(140, () => instance.current?.moveNext());
            };
          }
          if (index > 0) {
            const wizard = evalSteps[index - 1].wizard;
            nav.onPrev = () => {
              gotoWizard(wizard);
              stepAfter(140, () => instance.current?.movePrevious());
            };
          }
          return toDriveStep(
            step.target,
            step.titleTr,
            step.titleEn,
            step.bodyTr,
            step.bodyEn,
            nav,
            true,
          );
        });
      } else {
        visibleSteps = playgroundSteps.flatMap(
          ([target, titleTr, titleEn, bodyTr, bodyEn]) =>
            toDriveStep(target, titleTr, titleEn, bodyTr, bodyEn),
        );
      }
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
        allowKeyboardControl: !isEval,
        onPopoverRender: (popover) => {
          popover.closeButton.setAttribute(
            "aria-label",
            tr ? "Öğreticiyi kapat" : "Close tutorial",
          );
        },
        onDestroyed: () => {
          if (isEval) gotoWizard(0);
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
