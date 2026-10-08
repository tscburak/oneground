"use client";

import Image from "next/image";
import darkLogo from "../../public/darklogo.png";
import lightLogo from "../../public/lightlogo.png";
import { useParams } from "next/navigation";
import { Playground } from "@/components/playground/playground";
import { GuidedTour } from "@/components/guided-tour";
import { ModelSettingsDialog } from "@/components/model-settings-dialog";

export function Workspace() {
  const { lang } = useParams();
  const tr = lang === "tr";
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <Image
            src={lightLogo}
            alt="OneGround"
            className="theme-logo-light h-12 w-auto"
          />
          <Image
            src={darkLogo}
            alt="OneGround"
            className="theme-logo-dark h-12 w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <ModelSettingsDialog />
          <GuidedTour key={String(lang)} tr={tr} />
        </div>
      </div>
      <Playground />
    </div>
  );
}
