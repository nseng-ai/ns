import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

const WORKSPACE_ROOT = new URL("../../../../../", import.meta.url);
const CLI_SOURCE = "packages/public/ns/src/cli.ts";
const OBJECTIVE_DEFINITION_SUFFIXES = [
	"objective/check/definition.ts",
	"objective/exec/list-candidates/definition.ts",
	"objective/exec/load-orientations/definition.ts",
	"objective/exec/publication-bind/definition.ts",
	"objective/exec/publication-publish/definition.ts",
	"objective/exec/read-objective/definition.ts",
	"objective/exec/runner-begin/definition.ts",
	"objective/exec/runner-finish/definition.ts",
	"objective/exec/runner-subagent-usage/definition.ts",
	"objective/exec/tracking-gate/definition.ts",
	"objective/list/definition.ts",
	"objective/show/definition.ts",
] as const;
const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("real ns host Objectives command loading", () => {
	test.each([
		{ name: "root help", args: ["--help"] },
		{ name: "root version", args: ["--version"] },
		{ name: "root runtime", args: ["--runtime"] },
	])("$name does not load Objective command definitions", ({ args }) => {
		const run = runNsWithObjectiveImportLog(args);

		expect(run.status, run.stderr).toBe(0);
		expect(run.objectiveDefinitions).toEqual([]);
	});

	test("root Objective help lists visible leaves and hides exec", () => {
		const run = runNsWithObjectiveImportLog(["objective", "--help"]);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toMatch(/^  check(?:\s|$)/m);
		expect(run.stdout).toMatch(/^  list(?:\s|$)/m);
		expect(run.stdout).toMatch(/^  show(?:\s|$)/m);
		expect(run.stdout).not.toMatch(/^  exec(?:\s|$)/m);
		expect(run.objectiveDefinitions).toEqual([]);
	});

	test.each(OBJECTIVE_DEFINITION_SUFFIXES)("selected help loads only %s", (definitionSuffix) => {
		const route = definitionSuffix
			.replace(/^objective\//, "")
			.replace(/\/definition\.ts$/, "")
			.split("/");
		const run = runNsWithObjectiveImportLog(["objective", ...route, "--help"]);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toContain(`Usage: ns objective ${route.join(" ")}`);
		expect(run.objectiveDefinitions).toEqual([definitionSuffix]);
	});
});

function runNsWithObjectiveImportLog(args: readonly string[]): {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly objectiveDefinitions: readonly string[];
} {
	const directory = mkdtempSync(join(tmpdir(), "ns-objective-host-"));
	tempDirectories.push(directory);
	const hookPath = join(directory, "import-log-hook.mjs");
	const logPath = join(directory, "imports.log");
	writeFileSync(
		hookPath,
		`import { appendFileSync } from "node:fs";\nimport { registerHooks } from "node:module";\nregisterHooks({ resolve(specifier, context, nextResolve) { const result = nextResolve(specifier, context); if (result.url.includes("/objectives/src/ns/objective/") && result.url.endsWith("/definition.ts")) appendFileSync(process.env.NS_OBJECTIVE_IMPORT_LOG, result.url + "\\n"); return result; } });\n`,
		"utf8",
	);
	const result = spawnSync(process.execPath, ["--import", hookPath, CLI_SOURCE, ...args], {
		cwd: WORKSPACE_ROOT,
		encoding: "utf8",
		env: { ...process.env, NS_OBJECTIVE_IMPORT_LOG: logPath },
	});
	let importLog = "";
	try {
		importLog = readFileSync(logPath, "utf8");
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
	}
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		objectiveDefinitions: importLog
			.split("\n")
			.filter((line) => line !== "")
			.map((line) => line.slice(line.lastIndexOf("/objective/") + 1)),
	};
}
