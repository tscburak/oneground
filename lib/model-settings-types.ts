export type ModelProfile = {
  id: string;
  name: string;
  kind: "system-one" | "llm";
  model: string;
  baseUrl: string;
  prompt: string;
  inputPrice: number | null;
  outputPrice: number | null;
  hasApiKey: boolean;
};
export type Preferences = {
  defaultProfileId: string;
  stateMode: "single" | "bulk";
  delimiter: "newline" | "comma" | "semicolon" | "tab" | "jsonl";
};
export type ModelSettings = {
  models: ModelProfile[];
  preferences: Preferences;
};
export function evaluatorProfile(profile: ModelProfile) {
  return {
    profileId: profile.id,
    name: profile.name,
    kind: profile.kind,
    model: profile.model,
    baseUrl: profile.baseUrl,
    prompt: profile.prompt,
    inputPrice: profile.inputPrice,
    outputPrice: profile.outputPrice,
  };
}
