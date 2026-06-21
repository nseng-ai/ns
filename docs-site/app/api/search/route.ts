import { createSearchRoute } from "@vercel/geistdocs/routes/search";
import { geistdocsConfig } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";

export const GET = createSearchRoute({ config: geistdocsConfig, sources: [geistdocsSource] });
