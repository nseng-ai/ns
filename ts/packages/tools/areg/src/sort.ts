export function sortStringsLocaleAware(values: Iterable<string>): string[] {
	return [...values].sort((left, right) => left.localeCompare(right));
}

export function uniqueSortedStrings(values: readonly string[]): string[] {
	return sortStringsLocaleAware(new Set(values));
}
