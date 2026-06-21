import { createSitemapMarkdownRoute } from "@vercel/geistdocs/routes/sitemap";
import type { NextRequest } from "next/server";
import { config } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";

const sitemapMarkdownRoute = createSitemapMarkdownRoute({
  config,
  sources: [{ source: geistdocsSource }],
});

export const dynamic = "error";
export const revalidate = false;

export function GET(request: NextRequest): Promise<Response> {
  return sitemapMarkdownRoute.GET(request, {
    params: Promise.resolve({ lang: config.defaultLanguage }),
  });
}
