import { Feed } from "feed";
import { title } from "@/geistdocs";
import { geistdocsConfig } from "@/lib/geistdocs/config";
import { getPageMetadata, source } from "@/lib/geistdocs/source";
import { getSiteOrigin } from "@/lib/geistdocs/url";

export function buildRssResponse(lang = geistdocsConfig.defaultLanguage): Response {
  const baseUrl = getSiteOrigin();
  const feed = new Feed({
    title,
    id: baseUrl,
    link: baseUrl,
    language: lang,
    copyright: `All rights reserved ${new Date().getFullYear()}, sdl`,
  });

  for (const page of source.getPages(lang)) {
    const metadata = getPageMetadata(page);
    const pageUrl = new URL(page.url, baseUrl).toString();

    feed.addItem({
      id: pageUrl,
      title: metadata.title,
      description: metadata.description,
      link: pageUrl,
      date: metadata.lastModified,
      author: [
        {
          name: "sdl",
        },
      ],
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
