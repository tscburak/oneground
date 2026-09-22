"use client";

import { usePathname, useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useI18n } from "@/components/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultLocale, hasLocale, locales } from "@/lib/i18n";

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  tr: "Türkçe",
};

export function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useI18n();

  const current = hasLocale(pathname.split("/")[1] ?? "")
    ? (pathname.split("/")[1] as keyof typeof LOCALE_NAMES)
    : defaultLocale;

  return (
    <Select
      value={current}
      onValueChange={(v) => {
        if (v !== current) router.push(`/${v}`);
      }}
    >
      <SelectTrigger className="h-9 w-32" aria-label={dict.actions.language}>
        <Languages className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {LOCALE_NAMES[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
