import type { NextRequest } from "next/server";
import { config } from "@/lib/geistdocs/config";
import { createOgImageResponse, getRootOgStaticParams } from "./og-image";

interface RootOgContext {
  params: Promise<{
    slug: string[];
  }>;
}

export function GET(_request: NextRequest, { params }: RootOgContext): Promise<Response> {
  return params.then(({ slug }) => createOgImageResponse({ lang: config.defaultLanguage, slug }));
}

export function generateStaticParams(): Array<{ slug: string[] }> {
  return getRootOgStaticParams();
}
