const LOCALIZED_MACHINE_ROUTE_PATHS = new Set(["llms.txt", "agents.md", "sitemap.md", "rss.xml", "llms.mdx"]);
const LOCALIZED_MACHINE_ROUTE_PREFIXES = ["llms.mdx/", "og/"] as const;

function getLocalizedMachineRoutePath(pathname: string, languages: readonly string[]): string | null {
  for (const language of languages) {
    const languagePrefix = `/${language}/`;

    if (pathname.startsWith(languagePrefix)) return pathname.slice(languagePrefix.length);
  }

  return null;
}

export function isLocalizedMachineRoute(pathname: string, languages: readonly string[]): boolean {
  const path = getLocalizedMachineRoutePath(pathname, languages);

  if (path === null) return false;

  return (
    LOCALIZED_MACHINE_ROUTE_PATHS.has(path) ||
    LOCALIZED_MACHINE_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}
