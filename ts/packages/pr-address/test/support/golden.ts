import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));

/** Python-captured golden corpus shared with the legacy implementation. */
export const GOLDEN_V1_ROOT = resolve(fileURLToPath(new URL("../fixtures/golden/v1", import.meta.url)));

export interface GoldenCase {
	name: string;
	inputPath: string;
	expectedPath: string;
}

export async function goldenCases(operation: string): Promise<GoldenCase[]> {
	const operationDir = join(GOLDEN_V1_ROOT, operation);
	const entries = await readdir(operationDir, { withFileTypes: true });
	const cases = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({
			name: entry.name,
			inputPath: join(operationDir, entry.name, "input.json"),
			expectedPath: join(operationDir, entry.name, "expected.json"),
		}));
	if (cases.length === 0) {
		throw new Error(`goldenCases(${JSON.stringify(operation)}) found zero cases in ${operationDir}`);
	}
	cases.sort((left: GoldenCase, right: GoldenCase) => left.name.localeCompare(right.name));
	return cases;
}

export async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8"));
}

/**
 * Artifacts that embed the absolute payload root have root-length-dependent
 * byte sizes, so embedded `payload_bytes` values cannot be byte-compared
 * across machines. Callers normalize them and separately assert one reference
 * against the real file size.
 */
export function normalizePayloadBytes(text: string): string {
	return text.replace(/"payload_bytes": \d+/g, '"payload_bytes": 0');
}

export function asWrapperInput(value: unknown): { manifest: unknown; classification: unknown } {
	if (typeof value !== "object" || value === null || !("manifest" in value) || !("classification" in value)) {
		throw new TypeError("golden input must be a manifest/classification wrapper");
	}
	return value as { manifest: unknown; classification: unknown };
}
