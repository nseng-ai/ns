import { createAgentsRoute } from "@vercel/geistdocs/routes/agents";
import { geistdocsConfig } from "@/lib/geistdocs/config";

const agentsRoute = createAgentsRoute({
  config: geistdocsConfig,
});

export const GET = agentsRoute.GET;
export const generateStaticParams = agentsRoute.generateStaticParams;
export const revalidate = false;
