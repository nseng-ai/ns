export function pypiProjectJsonUrl(normalizedName: string): string {
	return `https://pypi.org/pypi/${encodeURIComponent(normalizedName)}/json`;
}

export function pypiProjectUrl(normalizedName: string): string {
	return `https://pypi.org/project/${encodeURIComponent(normalizedName)}/`;
}

export function npmRegistryUrl(packageName: string): string {
	return `https://registry.npmjs.org/${encodeNpmPackageName(packageName, "@")}`;
}

export function npmPackagePageUrl(packageName: string): string {
	return `https://www.npmjs.com/package/${encodeNpmPackageName(packageName, "@/")}`;
}

export function brewFormulaJsonUrl(formulaName: string): string {
	return `https://formulae.brew.sh/api/formula/${encodeURIComponent(formulaName)}.json`;
}

export function brewFormulaPageUrl(formulaName: string): string {
	return `https://formulae.brew.sh/formula/${encodeURIComponent(formulaName)}`;
}

function encodeNpmPackageName(packageName: string, safeCharacters: "@" | "@/"): string {
	// Match Python quote(..., safe="@") for registry URLs and quote(..., safe="@/") for pages.
	const encoded = encodeURIComponent(packageName).replaceAll("%40", "@");
	return safeCharacters === "@/" ? encoded.replaceAll("%2F", "/") : encoded;
}
