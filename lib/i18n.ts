import en from "../locale/en.json";
import tr from "../locale/tr.json";

const dictionaries = { en, tr } as const;

export type Dict = typeof en;
export type Locale = keyof typeof dictionaries;

export const locales = Object.keys(dictionaries) as Locale[];
export const defaultLocale: Locale = "en";

export function hasLocale(value: string): value is Locale {
  return value in dictionaries;
}

export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale] as Dict;
}
