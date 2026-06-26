export function sortStrings(values: readonly string[]): string[] {
	return [...values].sort();
}

export function uniqueSortedStrings(values: readonly string[]): string[] {
	return sortStrings([...new Set(values)]);
}
