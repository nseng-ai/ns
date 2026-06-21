import { createDocsMarkdownRoute } from "@vercel/geistdocs/routes/llms";
import { geistdocsSource } from "@/lib/geistdocs/source";

const docsMarkdownRoute = createDocsMarkdownRoute({
  sources: [geistdocsSource],
});

export const GET = docsMarkdownRoute.GET;
export const generateStaticParams = docsMarkdownRoute.generateStaticParams;
export const revalidate = false;
