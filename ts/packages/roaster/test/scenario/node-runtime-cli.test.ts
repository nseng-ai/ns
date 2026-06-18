import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describeNodeRuntimeCliEntrypoint } from "@asdl/core/testing";
import { expect, test } from "vitest";

const TS_WORKSPACE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CLI_SOURCE_PATH = "packages/roaster/src/cli.ts";

describeNodeRuntimeCliEntrypoint({
	name: "roaster Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: CLI_SOURCE_PATH,
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: roaster" },
		{ type: "contains", text: "--runtime" },
		{ type: "not_contains", text: "exec" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @asdl/roaster bin roaster -> ts/packages/roaster/src/cli.ts\n",
});

test("prints the package version", () => {
	const result = spawnSync(process.execPath, [CLI_SOURCE_PATH, "--version"], {
		cwd: TS_WORKSPACE_ROOT,
		encoding: "utf8",
	});

	expect(result.status, result.stderr).toBe(0);
	expect(result.stdout).toBe("0.1.0\n");
});
