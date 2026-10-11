import { Workspace } from "@/components/lab/workspace";
import { ModelSettingsProvider } from "@/components/model-settings-provider";

export default function Home() {
  return (
    <ModelSettingsProvider>
      <Workspace />
    </ModelSettingsProvider>
  );
}
