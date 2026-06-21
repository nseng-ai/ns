import { createProxy } from "@vercel/geistdocs/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { config as geistdocsConfig } from "@/lib/geistdocs/config";
import { trackMdRequest } from "@/lib/geistdocs/md-tracking";

function isLocalizedMachineRoute(pathname: string): boolean {
  const languagePrefix = `/${geistdocsConfig.defaultLanguage}/`;

  if (!pathname.startsWith(languagePrefix)) return false;

  const path = pathname.slice(languagePrefix.length);

  return (
    path === "llms.txt" ||
    path === "agents.md" ||
    path === "sitemap.md" ||
    path === "rss.xml" ||
    path === "llms.mdx" ||
    path.startsWith("llms.mdx/") ||
    path.startsWith("og/")
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
