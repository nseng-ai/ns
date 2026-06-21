import { MobileDocsBar } from "@vercel/geistdocs/mobile-docs-bar";
import { createDocsPage } from "@vercel/geistdocs/pages/docs";
import type { MDXComponents } from "mdx/types";
import { getMDXComponents } from "@/components/geistdocs/mdx-components";
import { geistdocsConfig } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";
import { getSiteOrigin } from "@/lib/geistdocs/url";

const docsPage = createDocsPage({
  config: geistdocsConfig,
  mdx: ({ link }) => {
    const components: MDXComponents = link ? { a: link } : {};
    return getMDXComponents(components);
  },
  metadata: ({ metadata }) => ({
    ...metadata,
    metadataBase: new URL(getSiteOrigin()),
  }),
  openGraph: {
    images: true,
  },
  source: geistdocsSource,
  tableOfContentPopover: {
    enabled: false,
  },
  renderTop: ({ data }) => <MobileDocsBar toc={data.toc} />,
});

export default docsPage.Page;
export const generateStaticParams = docsPage.generateStaticParams;
export const generateMetadata = docsPage.generateMetadata;
