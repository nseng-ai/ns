import { createDocsMarkdownRoute } from "@vercel/geistdocs/routes/llms";
import { config } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";

interface RootDocsMarkdownParams {
  slug?: string[];
}

interface RootDocsMarkdownContext {
  params: Promise<RootDocsMarkdownParams>;
}

const docsMarkdownRoute = createDocsMarkdownRoute({
  sources: [geistdocsSource],
});

export const revalidate = false;

export async function GET(request: Request, { params }: RootDocsMarkdownContext): Promise<Response> {
  const { slug } = await params;
  const routeParams = slug === undefined ? { lang: config.defaultLanguage } : { lang: config.defaultLanguage, slug };

  return docsMarkdownRoute.GET(request, {
    params: Promise.resolve(routeParams),
  });
}

export async function generateStaticParams(): Promise<RootDocsMarkdownParams[]> {
  const params = await docsMarkdownRoute.generateStaticParams({
    params: Promise.resolve({ lang: config.defaultLanguage }),
  });

  return params.map(({ slug }) => (slug === undefined ? {} : { slug }));
}
