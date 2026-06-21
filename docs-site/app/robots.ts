import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/geistdocs/url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: new URL("/sitemap.xml", getSiteOrigin()).toString(),
  };
}
