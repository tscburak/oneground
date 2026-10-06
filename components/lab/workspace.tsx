"use client";

import { useState } from "react";
import Image from "next/image";
import darkLogo from "../../public/darklogo.png";
import lightLogo from "../../public/lightlogo.png";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Playground } from "@/components/playground/playground";
import { ModelVsWorkspace } from "./model-vs-workspace";
import { GuidedTour } from "@/components/guided-tour";
import { ModelSettingsDialog } from "@/components/model-settings-dialog";
import { useModelSettings } from "@/components/model-settings-provider";

export function Workspace() {
  const { lang } = useParams();
  const tr = lang === "tr";
  const { settings: modelSettings } = useModelSettings();
  const [area, setArea] = useState("playground");
  const tourSection = area === "playground" ? "playground" : "compare";
  const [modelVsCompleted, setModelVsCompleted] = useState(false);
  return (
    <div>
      <Tabs value={area} onValueChange={setArea} className="w-full min-w-0">
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
          <TabsList>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="model-vs" aria-label="Model vs">
              Model vs{modelVsCompleted ? " ✓" : ""}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <ModelSettingsDialog />
            <GuidedTour
              key={`${tourSection}-${lang}`}
              section={tourSection}
              tr={tr}
            />
          </div>
        </div>
        <TabsContent value="playground">
          <Playground />
        </TabsContent>
        <TabsContent
          value="model-vs"
          forceMount
          hidden={area !== "model-vs"}
        >
          <div className="workspace-panel space-y-4">
            <ModelVsWorkspace
              profiles={modelSettings?.models ?? []}
              tr={tr}
              onCompleted={() => setModelVsCompleted(true)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
