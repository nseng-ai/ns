import type { MetadataRoute } from "next";
import { config } from "@/lib/geistdocs/config";
import { source } from "@/lib/geistdocs/source";
import { getSiteOrigin } from "@/lib/geistdocs/url";

interface SitemapPageData {
  lastModified?: Date;
}

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  const url = (path: string): string => new URL(path, origin).toString();

  const pages: MetadataRoute.Sitemap = source.getPages(config.defaultLanguage).map((page) => {
    const data = page.data as SitemapPageData;

    return {
      changeFrequency: "weekly" as const,
      lastModified: data.lastModified === undefined ? undefined : new Date(data.lastModified),
      priority: 0.5,
      url: url(page.url),
    };
  });

  return [
    {
      changeFrequency: "monthly",
      priority: 1,
      url: url("/"),
    },
    ...pages,
  ];
}
