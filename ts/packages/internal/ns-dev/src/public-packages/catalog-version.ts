export function catalogVersion(source: string, packageName: string): string {
	const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^\\s*['"]?${escaped}['"]?:\\s*([^\\s#]+)`, "m");
	const match = pattern.exec(source);
	if (match?.[1] === undefined) throw new Error(`Missing catalog version for ${packageName}`);
	return match[1].replace(/^['"]|['"]$/g, "");
}
