import { createProxy } from "@vercel/geistdocs/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { config as geistdocsConfig } from "@/lib/geistdocs/config";
import { trackMdRequest } from "@/lib/geistdocs/md-tracking";

const LOCALIZED_MACHINE_ROUTE_PATHS = new Set([
  "llms.txt",
  "agents.md",
  "sitemap.md",
  "rss.xml",
  "llms.mdx",
]);
const LOCALIZED_MACHINE_ROUTE_PREFIXES = ["llms.mdx/", "og/"];

function isLocalizedMachineRoute(pathname: string): boolean {
  const languagePrefix = `/${geistdocsConfig.defaultLanguage}/`;

  if (!pathname.startsWith(languagePrefix)) return false;

  const path = pathname.slice(languagePrefix.length);

  return (
    LOCALIZED_MACHINE_ROUTE_PATHS.has(path) ||
    LOCALIZED_MACHINE_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function beforeProxy({ request }: { request: NextRequest }): NextResponse | null {
  return isLocalizedMachineRoute(request.nextUrl.pathname) ? NextResponse.next() : null;
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
