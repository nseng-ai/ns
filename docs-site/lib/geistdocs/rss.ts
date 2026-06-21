import { Feed } from "feed";
import { title } from "@/geistdocs";
import { geistdocsConfig } from "@/lib/geistdocs/config";
import { source } from "@/lib/geistdocs/source";
import { getSiteOrigin } from "@/lib/geistdocs/url";

interface RssPageData {
  description?: string;
  lastModified?: Date;
  title?: string;
}

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
    const data = page.data as RssPageData;
    const pageUrl = new URL(page.url, baseUrl).toString();

    feed.addItem({
      id: pageUrl,
      title: data.title ?? page.url,
      description: data.description,
      link: pageUrl,
      date: new Date(data.lastModified ?? new Date()),
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
