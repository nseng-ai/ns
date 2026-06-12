import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const PI_EXTENSIONS_PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const ASDL_DEV_PACKAGE_ROOT = fileURLToPath(new URL("../../asdl-dev/", import.meta.url));
const CCC_PACKAGE_ROOT = fileURLToPath(new URL("../../ccc/", import.meta.url));

const PROJECT_EXTENSION_ADAPTERS = [
	".pi/extensions/asdl-dev.ts",
	".pi/extensions/ccc.ts",
	".pi/extensions/checkpoint-preview.ts",
	".pi/extensions/claude.ts",
	".pi/extensions/code.ts",
	".pi/extensions/dispatch-runner-subagent.ts",
	".pi/extensions/grill-ui.ts",
	".pi/extensions/handoff.ts",
	".pi/extensions/code-workflows.ts",
	".pi/extensions/just-fix.ts",
	".pi/extensions/objective.ts",
	".pi/extensions/planned-branch.ts",
	".pi/extensions/worktree-status.ts",
] as const;

const PI_EXTENSIONS_WORKSPACE_IMPORTS = [
	"@asdl/ccc/worktree-status/graphite-metadata",
	"@asdl/core/exec",
	"@asdl/planned-branch",
	"@asdl/plans",
	"asdl-dev/cli",
] as const;

const CCC_WORKSPACE_IMPORTS = [
	"@asdl/core/exec",
	"@asdl/planned-branch",
	"@asdl/plans",
	"asdl-dev/checkpoint-flow",
] as const;

const ASDL_DEV_EXPORT_IMPORTS = [
	"asdl-dev/checkpoint-flow",
	"asdl-dev/cli",
	"asdl-dev/context",
	"asdl-dev/pending-worktree",
	"asdl-dev/text-generation",
] as const;

interface NodeEvalOptions {
	cwd: string;
	source: string;
}

describe("Node runtime import smoke", () => {
	test("project-local Pi extension adapters import directly under Node", () => {
		const result = runNodeEval({
			cwd: REPO_ROOT,
			source: buildExtensionAdapterImportScript(PROJECT_EXTENSION_ADAPTERS),
		});

		expectSuccessfulNodeRun(result);
		expect(result.stdout).toContain("imported 13 extension adapters");
	});

	test("pi-extensions package imports workspace exports through package links under Node", () => {
		const result = runNodeEval({
			cwd: PI_EXTENSIONS_PACKAGE_ROOT,
			source: buildPackageImportScript(PI_EXTENSIONS_WORKSPACE_IMPORTS),
		});

		expectSuccessfulNodeRun(result);
		expect(result.stdout).toContain("imported 5 package specifiers");
	});

	test("ccc package imports representative cross-package dependencies under Node", () => {
		const result = runNodeEval({
			cwd: CCC_PACKAGE_ROOT,
			source: buildPackageImportScript(CCC_WORKSPACE_IMPORTS),
		});

		expectSuccessfulNodeRun(result);
		expect(result.stdout).toContain("imported 4 package specifiers");
	});

	test("asdl-dev package imports every declared export subpath under Node", () => {
		const result = runNodeEval({
			cwd: ASDL_DEV_PACKAGE_ROOT,
			source: buildPackageImportScript(ASDL_DEV_EXPORT_IMPORTS),
		});

		expectSuccessfulNodeRun(result);
		expect(result.stdout).toContain("imported 5 package specifiers");
	});
});

function runNodeEval(options: NodeEvalOptions): SpawnSyncReturns<string> {
	return spawnSync(process.execPath, ["--input-type=module", "--eval", options.source], {
		cwd: options.cwd,
		encoding: "utf8",
		env: process.env,
	});
}

function buildExtensionAdapterImportScript(relativePaths: readonly string[]): string {
	return `
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const relativePaths = ${JSON.stringify(relativePaths)};
for (const relativePath of relativePaths) {
	const moduleUrl = pathToFileURL(resolve(process.cwd(), relativePath)).href;
	const importedModule = await import(moduleUrl);
	if (typeof importedModule.default !== "function") {
		throw new Error(relativePath + " did not default-export an extension registration function.");
	}
}
console.log("imported ${relativePaths.length} extension adapters");
`;
}

function buildPackageImportScript(specifiers: readonly string[]): string {
	return `
const specifiers = ${JSON.stringify(specifiers)};
for (const specifier of specifiers) {
	await import(specifier);
}
console.log("imported ${specifiers.length} package specifiers");
`;
}

function expectSuccessfulNodeRun(result: SpawnSyncReturns<string>): void {
	const output = [result.stdout, result.stderr].filter((text) => text !== "").join("\n");
	expect(result.status, output).toBe(0);
}
