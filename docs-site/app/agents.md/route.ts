import { createAgentsRoute } from "@vercel/geistdocs/routes/agents";
import type { NextRequest } from "next/server";
import { config } from "@/lib/geistdocs/config";

const agentsRoute = createAgentsRoute({
  config,
});

export const revalidate = false;

export function GET(request: NextRequest): Promise<Response> {
  return agentsRoute.GET(request, {
    params: Promise.resolve({ lang: config.defaultLanguage }),
  });
}
