import type { NextRequest } from "next/server";
import { buildRssResponse } from "@/lib/geistdocs/rss";

export const revalidate = false;

export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/[lang]/rss.xml">
): Promise<Response> {
  const { lang } = await params;

  return buildRssResponse(lang);
}
