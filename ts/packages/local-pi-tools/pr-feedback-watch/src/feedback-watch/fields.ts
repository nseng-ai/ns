export function finiteNumberField(value: Record<string, unknown>, key: string): number | undefined {
	const field = value[key];
	return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

export function stringArrayField(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return undefined;
	return value.every((item): item is string => typeof item === "string") ? value : undefined;
}
