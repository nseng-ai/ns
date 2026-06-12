import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));

/** Python-captured golden corpus shared with the legacy implementation. */
export const GOLDEN_V1_ROOT = join(REPO_ROOT, "packages/asdl-pr-address/tests/golden/v1");

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
