import { siteUrl } from "./site-identity";

export function getSiteOrigin(): string {
  const urlInput = URL.canParse(siteUrl) ? siteUrl : withInferredProtocol(siteUrl);

  return new URL(urlInput).origin;
}

function withInferredProtocol(value: string): string {
  const protocol = isLocalSiteHost(value) ? "http" : "https";

  return `${protocol}://${value}`;
}

function isLocalSiteHost(value: string): boolean {
  const host = value.split(":", 1)[0];

  return host === "localhost" || host === "127.0.0.1";
}
