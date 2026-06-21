import "../global.css";
import { Navbar } from "@vercel/geistdocs/navbar";
import type { Metadata } from "next";
import { Footer } from "@/components/geistdocs/footer";
import { SiteProviders } from "@/components/geistdocs/provider";
import { geistdocsConfig } from "@/lib/geistdocs/config";
import { mono, sans } from "@/lib/geistdocs/fonts";
import { getSiteOrigin } from "@/lib/geistdocs/url";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  robots: {
    index: true,
    follow: true,
  },
};

export default async function Layout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;

  return (
    <html
      className={cn(sans.variable, mono.variable, "scroll-smooth antialiased")}
      lang={lang}
      suppressHydrationWarning
    >
      <body>
        <SiteProviders lang={lang}>
          <Navbar config={geistdocsConfig} />
          {children}
          <Footer config={geistdocsConfig} />
        </SiteProviders>
      </body>
    </html>
  );
}
