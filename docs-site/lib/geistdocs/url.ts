import { siteUrl } from "@/geistdocs";

const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;

export function getSiteOrigin(): string {
  return new URL(normalizeSiteUrl(siteUrl)).origin;
}

function normalizeSiteUrl(value: string): string {
  if (URL_SCHEME_PATTERN.test(value)) return value;

  const protocol = value.startsWith("localhost") || value.startsWith("127.0.0.1") ? "http" : "https";

  return `${protocol}://${value}`;
}
