import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url));
const PI_EXTENSIONS_PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PI_BIN = fileURLToPath(new URL("../../node_modules/.bin/pi", import.meta.url));
const CCC_PACKAGE_ROOT = fileURLToPath(new URL("../../../../capabilities/ccc/", import.meta.url));
const NS_PACKAGE_ROOT = fileURLToPath(new URL("../../../../kernel/", import.meta.url));

const PROJECT_EXTENSION_ADAPTERS = discoverProjectExtensionAdapters();

const PI_EXTENSIONS_WORKSPACE_IMPORTS = [
	"@nseng-ai/capability-kit/graphite/status",
	"@nseng-ai/core/exec",
	"@nseng-ai/branch-context",
	"@nseng-ai/plans",
	"@nseng-ai/kernel/cli",
] as const;

const CCC_WORKSPACE_IMPORTS = [
	"@nseng-ai/core/exec",
	"@nseng-ai/branch-context",
	"@nseng-ai/plans",
	"@nseng-ai/capability-kit/checkpoint-flow",
] as const;

const NS_EXPORT_IMPORTS = [
	"@nseng-ai/capability-kit/checkpoint-flow",
	"@nseng-ai/capability-kit/checkpoint-message",
	"@nseng-ai/core/exec",
	"@nseng-ai/kernel/cli",
	"@nseng-ai/kernel/context",
	"@nseng-ai/capability-kit/pending-worktree",
	"@nseng-ai/kernel/pi-text-generation",
	"@nseng-ai/kernel/sdk",
	"@nseng-ai/capability-kit/text-generation",
	"@nseng-ai/capability-kit/text-repair",
] as const;

interface NodeEvalOptions {
	cwd: string;
	source: string;
}

interface NodeRunExpectationContext {
	readonly cwd: string;
	readonly label: string;
}

describe("Node runtime import smoke", () => {
	test("project-local Pi extension adapters import directly under Node", () => {
		const result = runNodeEval({
			cwd: REPO_ROOT,
			source: buildExtensionAdapterImportScript(PROJECT_EXTENSION_ADAPTERS),
		});

		expectSuccessfulNodeRun(result, { cwd: REPO_ROOT, label: "project-local Pi adapters" });
		expect(result.stdout).toContain(
			`imported ${PROJECT_EXTENSION_ADAPTERS.length} extension adapters`,
		);
		expect(PROJECT_EXTENSION_ADAPTERS).toEqual(
			expect.arrayContaining([
				".pi/extensions/backing-skill-commands.ts",
				".pi/extensions/context-profiler.ts",
				".pi/extensions/dispatch-runner-subagent.ts",
				".pi/extensions/grill-ui.ts",
				".pi/extensions/pr.ts",
				".pi/extensions/thermo-council.ts",
			]),
		);
	}, 15_000);

	test("pi starts with every project-local extension discovered", () => {
		const tempConfigDir = mkdtempSync(join(tmpdir(), "ns-pi-extension-load-"));
		try {
			const result = spawnSync(
				PI_BIN,
				[
					"--approve",
					"--offline",
					"--no-skills",
					"--no-prompt-templates",
					"--no-themes",
					"--no-context-files",
					"--list-models",
				],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: {
						...process.env,
						PI_CODING_AGENT_DIR: tempConfigDir,
						PI_OFFLINE: "1",
					},
				},
			);

			expectSuccessfulNodeRun(result, {
				cwd: REPO_ROOT,
				label: `pi startup with ${PROJECT_EXTENSION_ADAPTERS.length} project-local extensions`,
			});
			expect(result.stdout).toContain("provider");
			expect(PROJECT_EXTENSION_ADAPTERS).toContain(".pi/extensions/ns.ts");
		} finally {
			rmSync(tempConfigDir, { force: true, recursive: true });
		}
	}, 30_000);

	test("pi package imports workspace exports through package links under Node", () => {
		const result = runNodeEval({
			cwd: PI_EXTENSIONS_PACKAGE_ROOT,
			source: buildPackageImportScript(PI_EXTENSIONS_WORKSPACE_IMPORTS),
		});

		expectSuccessfulNodeRun(result, {
			cwd: PI_EXTENSIONS_PACKAGE_ROOT,
			label: "pi package imports",
		});
		expect(result.stdout).toContain("imported 5 package specifiers");
	});

	test("ccc package imports representative cross-package dependencies under Node", () => {
		const result = runNodeEval({
			cwd: CCC_PACKAGE_ROOT,
			source: buildPackageImportScript(CCC_WORKSPACE_IMPORTS),
		});

		expectSuccessfulNodeRun(result, { cwd: CCC_PACKAGE_ROOT, label: "ccc package imports" });
		expect(result.stdout).toContain("imported 4 package specifiers");
	});

	test("kernel package imports every declared export subpath under Node", () => {
		const result = runNodeEval({
			cwd: NS_PACKAGE_ROOT,
			source: buildPackageImportScript(NS_EXPORT_IMPORTS),
		});

		expectSuccessfulNodeRun(result, { cwd: NS_PACKAGE_ROOT, label: "kernel package imports" });
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

function discoverProjectExtensionAdapters(): readonly string[] {
	return readdirSync(new URL("../../../../../../.pi/extensions/", import.meta.url))
		.filter((entry) => entry.endsWith(".ts"))
		.map((entry) => `.pi/extensions/${entry}`)
		.sort();
}

function buildExtensionAdapterImportScript(relativePaths: readonly string[]): string {
	return `
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const relativePaths = ${JSON.stringify(relativePaths)};
for (const relativePath of relativePaths) {
	try {
		const moduleUrl = pathToFileURL(resolve(process.cwd(), relativePath)).href;
		const importedModule = await import(moduleUrl);
		if (typeof importedModule.default !== "function") {
			throw new Error(relativePath + " did not default-export an extension registration function");
		}
	} catch (error) {
		console.error("Failed while importing extension adapter: " + relativePath);
		throw error;
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

function expectSuccessfulNodeRun(
	result: SpawnSyncReturns<string>,
	context: NodeRunExpectationContext,
): void {
	expect(result.status, formatNodeRunFailure(result, context)).toBe(0);
}

function formatNodeRunFailure(
	result: SpawnSyncReturns<string>,
	context: NodeRunExpectationContext,
): string {
	return [
		`Node runtime import smoke failed: ${context.label}`,
		`cwd: ${context.cwd}`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		"----- stdout -----",
		result.stdout,
		"----- stderr -----",
		result.stderr,
	].join("\n");
}
