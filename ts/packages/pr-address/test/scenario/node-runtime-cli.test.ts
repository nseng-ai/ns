import { spawnSync } from "node:child_process";
import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { useTempDirs } from "../support/temp.ts";

const TS_WORKSPACE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CLI_SOURCE_PATH = "packages/pr-address/src/cli.ts";
const makeScopedTempDir = useTempDirs();

async function makeTempDir(): Promise<string> {
	return makeScopedTempDir("pr-address-node-runtime-");
}

describe("pr-address Node runtime CLI entrypoint", () => {
	test("the committed source has a Node shebang", async () => {
		const source = await readFile(new URL("../../src/cli.ts", import.meta.url), "utf8");

		expect(source.split("\n", 1)[0]).toBe("#!/usr/bin/env node");
	});

	test("Node executes the TypeScript source entrypoint directly", () => {
		const result = spawnSync(process.execPath, [CLI_SOURCE_PATH, "--help"], {
			cwd: TS_WORKSPACE_ROOT,
			encoding: "utf8",
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Usage: pr-address");
		expect(result.stdout).toContain("--runtime");
		// PINNED CLINKR SEMANTICS: the hidden exec subgroup is omitted from
		// top-level help (Python parity) while staying invocable.
		expect(result.stdout).not.toContain("exec");
	});

	test("prints TypeScript runtime diagnostics", () => {
		const result = spawnSync(process.execPath, [CLI_SOURCE_PATH, "--runtime"], {
			cwd: TS_WORKSPACE_ROOT,
			encoding: "utf8",
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n");
	});

	test("Node executes the TypeScript entrypoint through a package-manager-style symlink", async () => {
		const tempDir = await makeTempDir();
		const shimPath = join(tempDir, "pr-address");
		await symlink(new URL("../../src/cli.ts", import.meta.url), shimPath);

		const result = spawnSync(process.execPath, [shimPath, "--runtime"], {
			cwd: TS_WORKSPACE_ROOT,
			encoding: "utf8",
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("runtime: typescript\nentry_point: @asdl/pr-address bin pr-address -> ts/packages/pr-address/src/cli.ts\n");
	});
});
