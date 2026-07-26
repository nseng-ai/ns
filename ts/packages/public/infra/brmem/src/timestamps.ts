export function normalizeBrmemTimestamp(timestamp: string): string {
	if (!timestamp.endsWith("Z")) return timestamp;
	const withoutUtcSuffix = timestamp.slice(0, -1);
	const withoutEmptyMilliseconds = withoutUtcSuffix.endsWith(".000")
		? withoutUtcSuffix.slice(0, -4)
		: withoutUtcSuffix;
	return `${withoutEmptyMilliseconds}+00:00`;
}
