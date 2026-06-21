import { createProxy, type GeistdocsProxyContext } from "@vercel/geistdocs/proxy";
import { NextResponse } from "next/server";
import { geistdocsConfig } from "@/lib/geistdocs/config";
import { isLocalizedMachineRoute } from "@/lib/geistdocs/machine-routes";
import { trackMdRequest } from "@/lib/geistdocs/md-tracking";

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
