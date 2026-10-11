import type { Metadata } from "next";
import { Roboto, Geist_Mono } from "next/font/google";
import { I18nProvider } from "@/components/i18n";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getDictionary } from "@/lib/i18n";
import { getModelSettings } from "@/lib/model-settings";
import "./globals.css";

export const dynamic = "force-dynamic";

const roboto = Roboto({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function currentLocale(): "en" | "tr" {
  try {
    return getModelSettings().preferences.locale === "tr" ? "tr" : "en";
  } catch {
    return "en";
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(currentLocale());
  return { title: dict.metadata.title, description: dict.metadata.description };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = currentLocale();
  const dict = getDictionary(lang);

  return (
    <html
      lang={lang}
      className={`${roboto.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <I18nProvider dict={dict} lang={lang}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster position="bottom-right" />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
