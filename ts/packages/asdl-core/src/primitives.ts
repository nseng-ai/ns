import { createHash } from "node:crypto";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function truncatedSha256Digest(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
}

export function mapFromRecordOrMap<T>(source: Readonly<Record<string, T>> | ReadonlyMap<string, T> | undefined): Map<string, T> {
	if (source === undefined) return new Map();
	if (source instanceof Map) return new Map(source);
	return new Map(Object.entries(source));
}
