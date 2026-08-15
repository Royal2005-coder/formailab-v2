import { Metadata } from "next";
import React from "react";
import { NoScriptWarning } from "@/app/components/NoScriptWarning";
import { SentryProvider } from "@/app/sentry/SentryProvider";
import {
  DEFAULT_LOCALE,
  IS_PRODUCTION,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
} from "@/lib/constants";
import { I18nProvider } from "@/lingodotdev/client";
import { getLocale } from "@/lingodotdev/language";
import "../modules/ui/globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | AILAB Survey",
    default: "AILAB Survey",
  },
  description: "AI-Powered Survey Platform",
  icons: {
    icon: [
      { url: "/favicon.svg?v=3", type: "image/svg+xml" },
      { url: "/favicon/favicon-32x32.png?v=3", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-16x16.png?v=3", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-48x48.png?v=3", sizes: "48x48", type: "image/png" },
      { url: "/favicon/android-chrome-192x192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/favicon/android-chrome-512x512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=3",
    apple: [{ url: "/favicon/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
  },
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const locale = await getLocale();

  return (
    <html lang={locale} translate="no">
      <body className="flex h-dvh flex-col transition-all ease-in-out">
        <NoScriptWarning locale={locale} />
        <SentryProvider
          sentryDsn={SENTRY_DSN}
          sentryRelease={SENTRY_RELEASE}
          sentryEnvironment={SENTRY_ENVIRONMENT}
          isEnabled={IS_PRODUCTION}>
          <I18nProvider language={locale} defaultLanguage={DEFAULT_LOCALE}>
            {children}
          </I18nProvider>
        </SentryProvider>
      </body>
    </html>
  );
};

export default RootLayout;
