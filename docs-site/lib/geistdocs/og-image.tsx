import { ImageResponse } from "next/og";
import { config } from "@/lib/geistdocs/config";
import { getPageImage, source } from "@/lib/geistdocs/source";

interface OgImageParams {
  lang: string;
  slug: string[];
}

interface OgPageData {
  description?: string;
  title?: string;
}

interface LocalizedOgStaticParams {
  lang: string;
  slug: string[];
}

interface RootOgStaticParams {
  slug: string[];
}

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

export function getLocalizedOgStaticParams(lang = config.defaultLanguage): LocalizedOgStaticParams[] {
  return source.getPages(lang).map((page) => ({
    lang: page.locale ?? lang,
    slug: getPageImage(page).segments,
  }));
}

export function getRootOgStaticParams(): RootOgStaticParams[] {
  return getLocalizedOgStaticParams(config.defaultLanguage).map(({ slug }) => ({ slug }));
}

export function createOgImageResponse({ lang, slug }: OgImageParams): ImageResponse | Response {
  if (slug.at(-1) !== "image.png") {
    return new Response("Not found", { status: 404 });
  }

  const page = source.getPage(slug.slice(0, -1), lang);

  if (!page) {
    return new Response("Not found", { status: 404 });
  }

  const data = page.data as OgPageData;
  const pageTitle = data.title ?? "SDL Documentation";
  const description = data.description ?? "Composable tooling for plan-oriented agentic engineering.";

  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "linear-gradient(135deg, #050816 0%, #102a43 52%, #1d4ed8 100%)",
        color: "white",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: 72,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div
          style={{
            color: "#93c5fd",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: 1.6,
            textTransform: "uppercase",
          }}
        >
          SDL Docs
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: -2.4,
            lineHeight: 1.05,
            maxWidth: 960,
          }}
        >
          {pageTitle}
        </div>
        <div
          style={{
            color: "#dbeafe",
            fontSize: 34,
            lineHeight: 1.3,
            maxWidth: 940,
          }}
        >
          {description}
        </div>
      </div>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          fontSize: 28,
          justifyContent: "space-between",
        }}
      >
        <div>Plan-oriented agentic engineering</div>
        <div style={{ color: "#bfdbfe" }}>sdl.tools</div>
      </div>
    </div>,
    {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
    }
  );
}
