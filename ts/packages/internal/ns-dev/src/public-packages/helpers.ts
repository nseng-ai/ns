export function snippet(value: string): string {
	const oneLine = value.replaceAll("\n", " ").trim();
	return oneLine.length > 240 ? `${oneLine.slice(0, 237)}...` : oneLine;
}

export function isMissingPackageResult(...parts: readonly string[]): boolean {
	const text = parts.join("\n");
	return (
		text.includes("E404") ||
		text.includes("404 Not Found") ||
		text.includes("is not in this registry")
	);
}

export function normalizeBinPaths(bin: unknown): Record<string, string> {
	if (typeof bin === "string") return { ns: stripLeadingCurrentDirectory(bin) };
	if (!isUnknownRecord(bin)) return {};
	return Object.fromEntries(
		Object.entries(bin).flatMap(([name, target]) =>
			typeof target === "string" ? [[name, stripLeadingCurrentDirectory(target)]] : [],
		),
	);
}

export function normalizeManifestBinPaths(bin: unknown): string | Record<string, string> | unknown {
	if (typeof bin === "string") return stripLeadingCurrentDirectory(bin);
	if (isUnknownRecord(bin)) return normalizeBinPaths(bin);
	return bin;
}

export function stripLeadingCurrentDirectory(value: string): string {
	return value.replace(/^\.\//, "");
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
