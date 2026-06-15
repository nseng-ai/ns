import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const TS_WORKSPACE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CLI_SOURCE_PATH = "packages/roaster/src/cli.ts";
const RUNTIME_INFO = "runtime: typescript\nentry_point: @asdl/roaster bin roaster -> ts/packages/roaster/src/cli.ts\n";

describe("roaster Node runtime CLI entrypoint", () => {
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
		expect(result.stdout).toContain("Usage: roaster");
		expect(result.stdout).toContain("--runtime");
		expect(result.stdout).not.toContain("exec");
	});

	test("prints the package version", () => {
		const result = spawnSync(process.execPath, [CLI_SOURCE_PATH, "--version"], {
			cwd: TS_WORKSPACE_ROOT,
			encoding: "utf8",
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("0.1.0\n");
	});

	test("prints TypeScript runtime diagnostics", () => {
		const result = spawnSync(process.execPath, [CLI_SOURCE_PATH, "--runtime"], {
			cwd: TS_WORKSPACE_ROOT,
			encoding: "utf8",
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe(RUNTIME_INFO);
	});
});
