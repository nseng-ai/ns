import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const LAND_SOURCE_DIRECTORY = join(REPO_ROOT, "ts/packages/capabilities/flow/src/land");
const LAND_STACK_SOURCE_DIRECTORY = join(LAND_SOURCE_DIRECTORY, "stack");
const LAND_EXECUTION_SOURCE_DIRECTORY = join(LAND_SOURCE_DIRECTORY, "execution");
const MIGRATED_MODULES = [
	"results.ts",
	"graphite-operations.ts",
	"worktree-paths.ts",
	"execution/host-seams.ts",
	"execution/execute.ts",
	"execution/isolated-landing.ts",
	"execution/maintenance-plan.ts",
	"execution/maintenance.ts",
	"execution/merge-loop.ts",
	"execution/post-landing-cleanup.ts",
	"execution/pre-merge.ts",
] as const;
const EXEC_ADAPTER_MODULES = new Set([
	"land.ts",
	"stack/backup-refs.ts",
	"stack/command-exec.ts",
	"stack/command-stream.ts",
	"stack/graphite-topology.ts",
	"stack/land-context-adapter.ts",
	"stack/pr-facts.ts",
	"stack/stack-facts.ts",
	"stack/types.ts",
	"stack/worktrees.ts",
]);
const FORBIDDEN_MIGRATED_MODULE_REFERENCES = [
	"LandStackExtensionAPI",
	"./stack/command-exec.ts",
	"./stack/stack-facts.ts",
	"./stack/worktrees.ts",
	"./stack/pr-facts.ts",
	"/stack/",
	"command-stream",
	"@nseng-ai/kernel",
	"@nseng-ai/pi",
] as const;

describe("land import direction", () => {
	test("migrated core modules do not reference stack execution or pi loaders", async () => {
		const violations: string[] = [];

		for (const sourceFile of MIGRATED_MODULES) {
			const source = await readFile(join(LAND_SOURCE_DIRECTORY, sourceFile), "utf8");
			for (const forbiddenReference of FORBIDDEN_MIGRATED_MODULE_REFERENCES) {
				if (source.includes(forbiddenReference)) {
					violations.push(`${sourceFile}: ${forbiddenReference}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	test("execution modules do not import stack modules", async () => {
		const sourceFiles = (await readdir(LAND_EXECUTION_SOURCE_DIRECTORY))
			.filter((fileName) => fileName.endsWith(".ts"))
			.sort();
		const violations: string[] = [];

		for (const sourceFile of sourceFiles) {
			const source = await readFile(join(LAND_EXECUTION_SOURCE_DIRECTORY, sourceFile), "utf8");
			if (/from\s+["'][^"']*\/stack\//.test(source)) violations.push(sourceFile);
		}

		expect(violations).toEqual([]);
	});

	test("only adapter-family land modules invoke command execution", async () => {
		const sourceFiles = await recursivelyListTypeScriptFiles(LAND_SOURCE_DIRECTORY);
		const violations: string[] = [];

		for (const sourceFile of sourceFiles) {
			const source = await readFile(join(LAND_SOURCE_DIRECTORY, sourceFile), "utf8");
			if (
				(/\bexec\s*\(/.test(source) || /\.exec\s*\(/.test(source)) &&
				!EXEC_ADAPTER_MODULES.has(sourceFile)
			) {
				violations.push(sourceFile);
			}
		}

		expect(violations).toEqual([]);
	});

	test("stack modules do not import the parent presentation module", async () => {
		const sourceFiles = (await readdir(LAND_STACK_SOURCE_DIRECTORY))
			.filter((fileName) => fileName.endsWith(".ts"))
			.sort();
		const violations: string[] = [];

		for (const sourceFile of sourceFiles) {
			const source = await readFile(join(LAND_STACK_SOURCE_DIRECTORY, sourceFile), "utf8");
			if (source.includes("../land-presentation")) violations.push(sourceFile);
		}

		expect(violations).toEqual([]);
	});
});

async function recursivelyListTypeScriptFiles(directory: string, prefix = ""): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) {
			files.push(
				...(await recursivelyListTypeScriptFiles(join(directory, entry.name), relativePath)),
			);
		} else if (entry.name.endsWith(".ts")) {
			files.push(relativePath);
		}
	}
	return files.sort();
}
