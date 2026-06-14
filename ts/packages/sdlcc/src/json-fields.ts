export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

export function optionalStringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = stringField(record, key);
	return value === undefined || value.length === 0 ? undefined : value;
}

export function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
	const value = record[key];
	return typeof value === "boolean" ? value : undefined;
}

export function stringArrayField(record: Record<string, unknown>, key: string): readonly string[] | undefined {
	const value = record[key];
	if (!Array.isArray(value)) return undefined;
	return value.every((item): item is string => typeof item === "string") ? value : undefined;
}

export function optionalEntry<T>(key: string, value: T | undefined): Record<string, T> {
	return value === undefined ? {} : { [key]: value };
}
