import { createSitemapMarkdownRoute } from "@vercel/geistdocs/routes/sitemap";
import { geistdocsConfig } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";

const sitemapMarkdownRoute = createSitemapMarkdownRoute({
  config: geistdocsConfig,
  sources: [{ source: geistdocsSource }],
});

export const GET = sitemapMarkdownRoute.GET;
export const generateStaticParams = sitemapMarkdownRoute.generateStaticParams;
export const dynamic = "error";
export const revalidate = false;
