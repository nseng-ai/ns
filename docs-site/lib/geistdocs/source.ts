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
