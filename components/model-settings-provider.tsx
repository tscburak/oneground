"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ModelSettings } from "@/lib/model-settings-types";

type SettingsContext = {
  settings: ModelSettings | null;
  error: string;
  mutate: (
    body: unknown,
  ) => Promise<ModelSettings & { savedProfileId?: string }>;
};
const Context = createContext<SettingsContext | null>(null);
export function ModelSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<ModelSettings | null>(null),
    [error, setError] = useState("");
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (alive) {
          setSettings(data);
          setError("");
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const focus = () => {
      void queue.current.then(load);
    };
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      window.removeEventListener("focus", focus);
    };
  }, []);
  const mutate = useCallback((body: unknown) => {
    const work = async () => {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSettings(data);
      setError("");
      return data as ModelSettings & { savedProfileId?: string };
    };
    const result = queue.current.catch(() => {}).then(work);
    queue.current = result;
    return result;
  }, []);
  return (
    <Context.Provider value={{ settings, error, mutate }}>
      {children}
    </Context.Provider>
  );
}
export function useModelSettings() {
  const context = useContext(Context);
  if (!context) throw new Error("ModelSettingsProvider is required.");
  return context;
}
