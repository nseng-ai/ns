export type TextResult =
	| {
			ok: true;
			text: string;
	  }
	| {
			ok: false;
			message: string;
	  };

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = record?.[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
