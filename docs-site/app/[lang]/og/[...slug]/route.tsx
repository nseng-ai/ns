import type { NextRequest } from "next/server";
import { createOgImageResponse, getLocalizedOgStaticParams } from "@/app/og/[...slug]/og-image";

export function GET(
  _request: NextRequest,
  { params }: RouteContext<"/[lang]/og/[...slug]">
): Promise<Response> {
  return params.then(({ lang, slug }) => createOgImageResponse({ lang, slug }));
}

export async function generateStaticParams({
  params,
}: RouteContext<"/[lang]/og/[...slug]">): Promise<Array<{ lang: string; slug: string[] }>> {
  const { lang } = await params;

  return getLocalizedOgStaticParams(lang);
}
