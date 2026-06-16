import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const PI_EXTENSIONS_PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CCC_PACKAGE_ROOT = fileURLToPath(new URL("../../ccc/", import.meta.url));
const SDL_PACKAGE_ROOT = fileURLToPath(new URL("../../sdl/", import.meta.url));

const PROJECT_EXTENSION_ADAPTERS = [
	".pi/extensions/ccc.ts",
	".pi/extensions/claude.ts",
	".pi/extensions/code.ts",
	".pi/extensions/dispatch-runner-subagent.ts",
	".pi/extensions/grill-ui.ts",
	".pi/extensions/handoff.ts",
	".pi/extensions/harness-session.ts",
	".pi/extensions/code-workflows.ts",
	".pi/extensions/home-directory-guard.ts",
	".pi/extensions/just-fix.ts",
	".pi/extensions/objective.ts",
	".pi/extensions/branch-context.ts",
	".pi/extensions/sdl.ts",
	".pi/extensions/worktree-status.ts",
] as const;

const PI_EXTENSIONS_WORKSPACE_IMPORTS = [
	"@asdl/ccc/worktree-status/graphite-metadata",
	"@asdl/core/exec",
	"@asdl/branch-context",
	"@asdl/plans",
	"@asdl/sdl/cli",
] as const;

const CCC_WORKSPACE_IMPORTS = [
	"@asdl/core/exec",
	"@asdl/branch-context",
	"@asdl/plans",
	"@asdl/sdl/checkpoint-flow",
] as const;

const SDL_EXPORT_IMPORTS = [
	"@asdl/sdl/checkpoint",
	"@asdl/sdl/checkpoint-flow",
	"@asdl/sdl/checkpoint-message",
	"@asdl/sdl/cli",
	"@asdl/sdl/context",
	"@asdl/sdl/pending-worktree",
	"@asdl/sdl/pi-text-generation",
	"@asdl/sdl/sdk",
	"@asdl/sdl/text-generation",
	"@asdl/sdl/text-repair",
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
		expect(result.stdout).toContain(`imported ${PROJECT_EXTENSION_ADAPTERS.length} extension adapters`);
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

	test("sdl package imports every declared export subpath under Node", () => {
		const result = runNodeEval({
			cwd: SDL_PACKAGE_ROOT,
			source: buildPackageImportScript(SDL_EXPORT_IMPORTS),
		});

		expectSuccessfulNodeRun(result);
		expect(result.stdout).toContain("imported 10 package specifiers");
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
