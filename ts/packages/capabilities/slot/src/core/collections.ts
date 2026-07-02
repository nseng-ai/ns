export function deduplicateOrderedStrings(values: readonly string[]): readonly string[] {
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const value of values) {
		if (seen.has(value)) continue;
		seen.add(value);
		deduped.push(value);
	}
	return deduped;
}
