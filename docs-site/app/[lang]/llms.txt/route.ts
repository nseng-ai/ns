import { createLlmsRoute } from "@vercel/geistdocs/routes/llms";
import { geistdocsSource } from "@/lib/geistdocs/source";

const llmsRoute = createLlmsRoute({
  sources: [geistdocsSource],
});

export const GET = llmsRoute.GET;
export const revalidate = false;
