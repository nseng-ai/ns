import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const workspaceRoot = process.cwd();
const repoRoot = path.dirname(workspaceRoot);
const guardFile = path.join(workspaceRoot, "packages/pr-address/test/unit/session-identity-guard.test.ts");

const scannedRoots = [
	path.join(workspaceRoot, "packages/pr-address/src"),
	path.join(workspaceRoot, "packages/pr-address/test"),
	path.join(workspaceRoot, "packages/pi-extensions/src"),
	path.join(workspaceRoot, "packages/pi-extensions/test"),
	path.join(repoRoot, ".pi/extensions"),
	path.join(repoRoot, "skills/pr-address"),
];

const scannedExtensions = new Set([".ts", ".md", ".json"]);

async function listFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const nested = await Promise.all(entries.map(async (entry) => {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) return listFiles(entryPath);
		if (!entry.isFile()) return [];
		if (!scannedExtensions.has(path.extname(entry.name))) return [];
		if (entryPath === guardFile) return [];
		return [entryPath];
	}));
	return nested.flat();
}

describe("HARNESS_SESSION_ID migration guardrails", () => {
	test("active code, tests, and pr-address docs do not reference legacy payload session inputs", async () => {
		const files = (await Promise.all(scannedRoots.map((root) => listFiles(root)))).flat();
		const forbidden = [
			"ASDL_PAYLOAD" + "_SESSION_ID",
			"--payload" + "-session-id",
			"payload" + "_session_required",
			"payload" + "_session_id",
			"harness" + "_session_id_digest",
			"payload" + "_session_invalid",
		];
		const violations: string[] = [];

		for (const file of files) {
			const text = await readFile(file, "utf8");
			for (const token of forbidden) {
				if (text.includes(token)) violations.push(`${path.relative(repoRoot, file)}: ${token}`);
			}
		}

		expect(violations).toEqual([]);
	});
});
