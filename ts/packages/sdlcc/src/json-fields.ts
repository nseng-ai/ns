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

export function parseJsonObject(stdout: string, label: string): { readonly type: "success"; readonly data: Record<string, unknown> } | { readonly type: "failure"; readonly message: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout.trim() || "{}");
	} catch (error) {
		return { type: "failure", message: `${label} was invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
	}
	if (!isRecord(parsed)) return { type: "failure", message: `${label} was not a JSON object.` };
	return { type: "success", data: parsed };
}
