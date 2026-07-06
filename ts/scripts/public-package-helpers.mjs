export function catalogVersion(source, packageName) {
	const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^\\s*['"]?${escaped}['"]?:\\s*([^\\s#]+)`, "m");
	const match = pattern.exec(source);
	if (match?.[1] === undefined) throw new Error(`Missing catalog version for ${packageName}`);
	return match[1].replace(/^['"]|['"]$/g, "");
}

export function snippet(value) {
	const oneLine = value.replaceAll("\n", " ").trim();
	return oneLine.length > 240 ? `${oneLine.slice(0, 237)}...` : oneLine;
}

export function isMissingPackageResult(...parts) {
	const text = parts.join("\n");
	return text.includes("E404") || text.includes("404 Not Found") || text.includes("is not in this registry");
}

export function normalizeBinPaths(bin) {
	if (typeof bin === "string") return { ns: stripLeadingCurrentDirectory(bin) };
	if (bin !== null && typeof bin === "object" && !Array.isArray(bin)) {
		return Object.fromEntries(Object.entries(bin).map(([name, target]) => [name, stripLeadingCurrentDirectory(target)]));
	}
	return {};
}

export function normalizeManifestBinPaths(bin) {
	if (typeof bin === "string") return stripLeadingCurrentDirectory(bin);
	if (bin !== null && typeof bin === "object" && !Array.isArray(bin)) {
		return Object.fromEntries(Object.entries(bin).map(([name, target]) => [name, stripLeadingCurrentDirectory(target)]));
	}
	return bin;
}

export function stripLeadingCurrentDirectory(value) {
	return typeof value === "string" ? value.replace(/^\.\//, "") : value;
}
