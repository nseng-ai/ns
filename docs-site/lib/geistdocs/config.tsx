import { defineConfig } from "@vercel/geistdocs/config";
import { agent, prompt, suggestions } from "./ai-assistant";
import { Logo } from "./brand";
import { github, nav } from "./nav";
import { basePath, siteId, title, translations } from "./site-identity";

export const geistdocsConfig = defineConfig({
  title,
  agent,
  defaultLanguage: "en",
  logo: <Logo />,
  github,
  nav,
  basePath,
  siteId,
  translations,
  content: [{ id: "docs", label: "Docs", dir: "docs", route: "/docs" }],
  ai: {
    enabled: false,
    prompt,
    suggestions,
  },
});
