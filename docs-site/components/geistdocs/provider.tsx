"use client";

import { Analytics } from "@vercel/analytics/next";
import { GeistdocsProvider as PackageProvider } from "@vercel/geistdocs/layout";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { ReactNode } from "react";
import { config } from "@/lib/geistdocs/config";

interface SiteProvidersProps {
  children: ReactNode;
  lang?: string;
}

export function SiteProviders({ children, lang }: SiteProvidersProps) {
  return (
    <>
      <PackageProvider config={config} lang={lang}>
        {children}
      </PackageProvider>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
