import { createProxy, type GeistdocsProxyContext } from "@vercel/geistdocs/proxy";
import { NextResponse } from "next/server";
import { config as geistdocsConfig } from "@/lib/geistdocs/config";
import { trackMdRequest } from "@/lib/geistdocs/md-tracking";

// These paths have concrete app/[lang] route handlers and must bypass Geistdocs' default-locale hiding.
const LOCALIZED_MACHINE_ROUTE_PATHS = new Set([
  "llms.txt",
  "agents.md",
  "sitemap.md",
  "rss.xml",
  "llms.mdx",
]);
const LOCALIZED_MACHINE_ROUTE_PREFIXES = ["llms.mdx/", "og/"] as const;

function getLocalizedMachineRoutePath(pathname: string, languages: readonly string[]): string | null {
  for (const language of languages) {
    const languagePrefix = `/${language}/`;

    if (pathname.startsWith(languagePrefix)) return pathname.slice(languagePrefix.length);
  }

  return null;
}

function isLocalizedMachineRoute(pathname: string, languages: readonly string[]): boolean {
  const path = getLocalizedMachineRoutePath(pathname, languages);

  if (path === null) return false;

  return (
    LOCALIZED_MACHINE_ROUTE_PATHS.has(path) ||
    LOCALIZED_MACHINE_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function beforeProxy({ languages, request }: GeistdocsProxyContext): NextResponse | null {
  return isLocalizedMachineRoute(request.nextUrl.pathname, languages) ? NextResponse.next() : null;
}

const proxy = createProxy({
  config: geistdocsConfig,
  trackMarkdownRequest: trackMdRequest,
  before: beforeProxy,
});

export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};

export default proxy;
