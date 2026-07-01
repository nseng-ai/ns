import { createSource } from "@vercel/geistdocs/source";
import { docs } from "@/.source/server";
import { geistdocsConfig } from "./config";

export const geistdocsSource = createSource({
  docs,
  config: geistdocsConfig,
  id: "docs",
  label: "Docs",
});

export const source = geistdocsSource.source;
export const getPageImage = geistdocsSource.getPageImage;
export const getLLMText = geistdocsSource.getPageMarkdown;

interface GeistdocsPage {
  data: unknown;
  url: string;
}

interface GeistdocsPageData {
  description?: string;
  lastModified?: Date;
  title?: string;
}

interface PageMetadataOptions {
  fallbackDescription?: string;
  fallbackTitle?: string;
}

interface PageMetadata {
  description?: string;
  lastModified: Date;
  title: string;
}

export function getPageMetadata(page: GeistdocsPage, options: PageMetadataOptions = {}): PageMetadata {
  const data = page.data as GeistdocsPageData;
  const description = data.description ?? options.fallbackDescription;

  return {
    title: data.title ?? options.fallbackTitle ?? page.url,
    ...(description === undefined ? {} : { description }),
    lastModified: new Date(data.lastModified ?? new Date()),
  };
}
