"use client";

import Image from "next/image";
import darkLogo from "../../public/darklogo.png";
import lightLogo from "../../public/lightlogo.png";
import { useState } from "react";
import { Playground } from "@/components/playground/playground";
import { EvalLab } from "@/components/eval-lab/eval-lab";
import { GuidedTour } from "@/components/guided-tour";
import { ModelSettingsDialog } from "@/components/model-settings-dialog";
import { useI18n, useLocale } from "@/components/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function Workspace() {
  const lang = useLocale();
  const tr = lang === "tr";
  const dict = useI18n();
  const [tab, setTab] = useState("playground");
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
          <GuidedTour key={String(lang)} tr={tr} section={tab} />
        </div>
      </div>
      <div className="workspace-panel">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="playground">{dict.workspace.playground}</TabsTrigger>
            <TabsTrigger value="eval-lab">{dict.workspace.evalLab}</TabsTrigger>
          </TabsList>
          <TabsContent value="playground" className="mt-6">
            <Playground />
          </TabsContent>
          <TabsContent value="eval-lab" className="mt-6">
            <EvalLab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
