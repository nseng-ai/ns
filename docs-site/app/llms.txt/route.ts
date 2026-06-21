import { createLlmsRoute } from "@vercel/geistdocs/routes/llms";
import type { NextRequest } from "next/server";
import { config } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";

const llmsRoute = createLlmsRoute({
  sources: [geistdocsSource],
});

export const revalidate = false;

export function GET(request: NextRequest): Promise<Response> {
  return llmsRoute.GET(request, {
    params: Promise.resolve({ lang: config.defaultLanguage }),
  });
}
