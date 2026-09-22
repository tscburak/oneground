"use client";

import { createContext, useContext } from "react";
import type { Dict } from "@/lib/i18n";

const I18nContext = createContext<Dict | null>(null);

export function I18nProvider({ dict, children }: { dict: Dict; children: React.ReactNode }) {
  return <I18nContext.Provider value={dict}>{children}</I18nContext.Provider>;
}

export function useI18n(): Dict {
  const dict = useContext(I18nContext);
  if (!dict) throw new Error("useI18n must be used within an I18nProvider");
  return dict;
}

export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}
