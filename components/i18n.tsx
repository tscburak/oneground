"use client";

import { createContext, useContext } from "react";
import type { Dict } from "@/lib/i18n";

const I18nContext = createContext<Dict | null>(null);
const LocaleContext = createContext<string>("en");

export function I18nProvider({
  dict,
  lang,
  children,
}: {
  dict: Dict;
  lang: string;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={dict}>
      <LocaleContext.Provider value={lang}>
        {children}
      </LocaleContext.Provider>
    </I18nContext.Provider>
  );
}

export function useI18n(): Dict {
  const dict = useContext(I18nContext);
  if (!dict) throw new Error("useI18n must be used within an I18nProvider");
  return dict;
}

export function useLocale(): string {
  return useContext(LocaleContext);
}

export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}
