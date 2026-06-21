import type { NextRequest } from "next/server";
import { config } from "@/lib/geistdocs/config";
import { buildRssResponse } from "./rss-response";

export const revalidate = false;

export function GET(_request: NextRequest): Response {
  return buildRssResponse(config.defaultLanguage);
}
