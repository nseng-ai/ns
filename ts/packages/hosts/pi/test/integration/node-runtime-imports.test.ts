import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url));
const PI_EXTENSIONS_PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PI_BIN = fileURLToPath(new URL("../../node_modules/.bin/pi", import.meta.url));
const SDK_PACKAGE_ROOT = fileURLToPath(new URL("../../../../sdk/", import.meta.url));

const PROJECT_EXTENSION_ADAPTERS = discoverProjectExtensionAdapters();
const NS_PROJECT_EXTENSION_ADAPTER = ".pi/extensions/ns.ts";

// Pi logs this line to stderr and continues when a project extension fails to load,
// so it can leave the process exit status at 0. Assert on the marker directly rather
// than relying on the exit code alone.
const EXTENSION_LOAD_FAILURE_MARKER = "Failed to load extension";

const PI_EXTENSIONS_WORKSPACE_IMPORTS = [
	"@nseng-ai/capability-kit/graphite/status",
	"@nseng-ai/foundation/exec",
	"@nseng-ai/branch-context",
	"@nseng-ai/plans",
	"@nseng-ai/sdk/cli",
] as const;

const SDK_EXPORT_IMPORTS = [
	"@nseng-ai/capability-kit/checkpoint-flow",
	"@nseng-ai/capability-kit/checkpoint-message",
	"@nseng-ai/foundation/exec",
	"@nseng-ai/sdk/cli",
	"@nseng-ai/sdk/context",
	"@nseng-ai/capability-kit/pending-worktree",
	"@nseng-ai/sdk",
	"@nseng-ai/ns/cli",
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
	test("project-local Pi extension adapters each import in a cold Node process", () => {
		for (const adapter of PROJECT_EXTENSION_ADAPTERS) {
			const result = runNodeEval({
				cwd: REPO_ROOT,
				source: buildExtensionAdapterImportScript([adapter]),
			});

			expectSuccessfulNodeRun(result, {
				cwd: REPO_ROOT,
				label: `cold import of ${adapter}`,
			});
			expect(result.stdout).toContain("imported 1 extension adapters");
		}
		expect(PROJECT_EXTENSION_ADAPTERS).toEqual(
			expect.arrayContaining([
				".pi/extensions/backing-skill-commands.ts",
				".pi/extensions/context-profiler.ts",
				".pi/extensions/agents.ts",
				".pi/extensions/grill-ui.ts",
				".pi/extensions/pr.ts",
				".pi/extensions/thermo-council.ts",
			]),
		);
	}, 30_000);

	test("pi loads the ns project extension adapter in isolation", () => {
		// Loading every project extension together can mask jiti evaluation-order failures
		// when another extension initializes a shared workspace barrel first.
		const result = runPiExtensionLoad([
			"--no-extensions",
			"--extension",
			NS_PROJECT_EXTENSION_ADAPTER,
		]);
		const context = {
			cwd: REPO_ROOT,
			label: `isolated ${NS_PROJECT_EXTENSION_ADAPTER} startup`,
		};

		expectSuccessfulPiExtensionLoad(result, context);
	}, 30_000);

	test("pi loads every project-local extension without failures", () => {
		const result = runPiExtensionLoad([]);
		const context = {
			cwd: REPO_ROOT,
			label: `pi startup with ${PROJECT_EXTENSION_ADAPTERS.length} project-local extensions`,
		};

		expectSuccessfulPiExtensionLoad(result, context);
		expect(PROJECT_EXTENSION_ADAPTERS).toContain(NS_PROJECT_EXTENSION_ADAPTER);
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

	test("SDK package imports every declared export subpath under Node", () => {
		const result = runNodeEval({
			cwd: SDK_PACKAGE_ROOT,
			source: buildPackageImportScript(SDK_EXPORT_IMPORTS),
		});

		expectSuccessfulNodeRun(result, { cwd: SDK_PACKAGE_ROOT, label: "SDK package imports" });
		expect(result.stdout).toContain("imported 10 package specifiers");
	});
});

function runNodeEval(options: NodeEvalOptions): SpawnSyncReturns<string> {
	return spawnSync(process.execPath, ["--input-type=module", "--eval", options.source], {
		cwd: options.cwd,
		encoding: "utf8",
		env: {
			HOME: process.env.HOME,
			PATH: process.env.PATH,
		},
	});
}

function runPiExtensionLoad(extensionArgs: readonly string[]): SpawnSyncReturns<string> {
	const tempConfigDir = mkdtempSync(join(tmpdir(), "ns-pi-extension-load-"));
	const tempGitRepo = mkdtempSync(join(tmpdir(), "ns-pi-extension-git-"));
	try {
		prepareGraphiteRepository(tempGitRepo);
		// `--list-models` exits before extensions are initialized, so it never
		// exercises extension loading. RPC mode with `--approve` trusts and actually
		// imports extensions, which is what surfaces module-resolution regressions in
		// extension dependency graphs. EOF then exits without invoking a model, while
		// offline mode and disabled resources keep the run hermetic (no network, no
		// tool execution).
		return spawnSync(
			PI_BIN,
			[
				"--mode",
				"rpc",
				"--approve",
				"--offline",
				...extensionArgs,
				"--no-tools",
				"--no-skills",
				"--no-prompt-templates",
				"--no-themes",
				"--no-context-files",
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: {
					...process.env,
					GIT_DIR: join(tempGitRepo, ".git"),
					GIT_WORK_TREE: REPO_ROOT,
					PI_CODING_AGENT_DIR: tempConfigDir,
					PI_OFFLINE: "1",
				},
			},
		);
	} finally {
		rmSync(tempConfigDir, { force: true, recursive: true });
		rmSync(tempGitRepo, { force: true, recursive: true });
	}
}

function prepareGraphiteRepository(repo: string): void {
	runSetupCommand("git", ["init", "--initial-branch", "master", repo], repo);
	runSetupCommand("git", ["config", "user.name", "ns integration"], repo);
	runSetupCommand("git", ["config", "user.email", "integration@ns.invalid"], repo);
	runSetupCommand("git", ["commit", "--allow-empty", "-m", "Initialize test repository"], repo);
	runSetupCommand("gt", ["repo", "init", "--trunk", "master", "--no-interactive"], repo);
}

function runSetupCommand(command: string, args: readonly string[], cwd: string): void {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	if (result.status === 0) return;
	throw new Error(
		[`Failed to prepare Pi extension test repository: ${command} ${args.join(" ")}`, result.stderr]
			.filter((line) => line.length > 0)
			.join("\n"),
	);
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

function expectSuccessfulPiExtensionLoad(
	result: SpawnSyncReturns<string>,
	context: NodeRunExpectationContext,
): void {
	const combinedOutput = `${result.stdout}\n${result.stderr}`;
	expect(
		combinedOutput.includes(EXTENSION_LOAD_FAILURE_MARKER),
		formatNodeRunFailure(result, context),
	).toBe(false);
	expectSuccessfulNodeRun(result, context);
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
