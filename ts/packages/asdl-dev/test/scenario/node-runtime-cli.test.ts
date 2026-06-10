import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const TS_WORKSPACE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CLI_SOURCE_PATH = "packages/asdl-dev/src/cli.ts";

describe("asdl-dev Node runtime CLI entrypoint", () => {
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
		expect(result.stdout).toContain("Usage: asdl-dev");
		expect(result.stdout).toContain("--runtime");
		expect(result.stdout).toContain("preview-url");
	});

	test("prints TypeScript runtime diagnostics", () => {
		const result = spawnSync(process.execPath, [CLI_SOURCE_PATH, "--runtime"], {
			cwd: TS_WORKSPACE_ROOT,
			encoding: "utf8",
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("runtime: typescript\nentry_point: asdl-dev bin asdl-dev -> ts/packages/asdl-dev/src/cli.ts\n");
	});
});
