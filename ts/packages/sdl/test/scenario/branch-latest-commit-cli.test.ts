import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test, vi } from "vitest";

import { listSdlCommands } from "@sdl/sdl/cli";

import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";

const FLOW_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/flow", import.meta.url),
);
const tempProjectDirs: string[] = [];
const HEAD_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PARENT_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function branchNameSuffix(index: number): string {
	return index === 0 ? "" : `-${index + 1}`;
}

function branchParentPrefixes(branchName: string): string[] {
	const segments = branchName.split("/");
	const prefixes: string[] = [];
	for (let index = 1; index < segments.length; index += 1) {
		prefixes.push(segments.slice(0, index).join("/"));
	}
	return prefixes;
}

function availableBranchResponses(branchName: string): ScriptedExecResponse[] {
	return [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git show-ref --verify --quiet refs/heads/${branchName}`, result: { code: 1 } },
		...branchParentPrefixes(branchName).map((prefix) => ({
			match: `git show-ref --verify --quiet refs/heads/${prefix}`,
			result: { code: 1 },
		})),
		{
			match: `git for-each-ref --format=%(refname:strip=2) refs/heads/${branchName}/*`,
			result: { stdout: "" },
		},
	];
}

function exactExistingBranchResponse(branchName: string): ScriptedExecResponse[] {
	return [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git show-ref --verify --quiet refs/heads/${branchName}`, result: {} },
	];
}

function childExistingBranchResponses(
	branchName: string,
	childBranch: string,
): ScriptedExecResponse[] {
	return [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git show-ref --verify --quiet refs/heads/${branchName}`, result: { code: 1 } },
		...branchParentPrefixes(branchName).map((prefix) => ({
			match: `git show-ref --verify --quiet refs/heads/${prefix}`,
			result: { code: 1 },
		})),
		{
			match: `git for-each-ref --format=%(refname:strip=2) refs/heads/${branchName}/*`,
			result: { stdout: `${childBranch}\n` },
		},
	];
}

function parentCollisionExhaustionResponses(options: {
	base: string;
	parent: string;
}): ScriptedExecResponse[] {
	return Array.from(
		{ length: 50 },
		(_, index) => `${options.base}${branchNameSuffix(index)}`,
	).flatMap((branchName) => [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git show-ref --verify --quiet refs/heads/${branchName}`, result: { code: 1 } },
		...branchParentPrefixes(branchName).map((prefix) => ({
			match: `git show-ref --verify --quiet refs/heads/${prefix}`,
			result: { code: prefix === options.parent ? 0 : 1 },
		})),
		{
			match: `git for-each-ref --format=%(refname:strip=2) refs/heads/${branchName}/*`,
			result: { stdout: "" },
		},
	]);
}

function createBranchLatestCommitProject(): string {
	const directory = mkdtempSync(join(tmpdir(), "sdl-branch-latest-project-"));
	tempProjectDirs.push(directory);
	cpSync(FLOW_EXTENSION_SOURCE, join(directory, ".sdl", "extensions", "flow"), {
		recursive: true,
	});
	return directory;
}

function runUnavailableBranchLatestCli(args: readonly string[]) {
	return runCliWithFakes(
		{ args, state: { exec: [], textGeneration: [] } },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(
		{ ...options, cwd: options.cwd ?? createBranchLatestCommitProject() },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

function cleanLatestCommitResponses(
	options: {
		backupDeleteCode?: number;
		targetBranchName?: string;
		targetAvailability?: ScriptedExecResponse[];
		backupAvailability?: ScriptedExecResponse[];
	} = {},
): ScriptedExecResponse[] {
	const targetBranchName = options.targetBranchName ?? "extract-commit";
	const backupBranchName = "autobranch-backup/feature/source/123456789";
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/source\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
		{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
		{ match: "git branch --show-current", result: { stdout: "feature/source\n" } },
		{
			match: "git for-each-ref --format=%(upstream:short) refs/heads/feature/source",
			result: { stdout: "" },
		},
		{ match: "gt children --no-interactive", result: { stdout: "" } },
		{
			match: "git rev-list --parents -n 1 HEAD",
			result: { stdout: `${HEAD_SHA} ${PARENT_SHA}\n` },
		},
		{ match: "git log -1 --format=%B", result: { stdout: "Add autobranch\n\nBody\n" } },
		{
			match: "git diff HEAD^ HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		...(options.targetAvailability ?? availableBranchResponses("extract-commit")),
		{ match: "git branch --show-current", result: { stdout: "feature/source\n" } },
		{
			match: "git for-each-ref --format=%(upstream:short) refs/heads/feature/source",
			result: { stdout: "" },
		},
		...(options.backupAvailability ?? availableBranchResponses(backupBranchName)),
		{
			match: `git branch ${backupBranchName} ${HEAD_SHA}`,
			result: {},
		},
		{ match: "git branch --show-current", result: { stdout: "feature/source\n" } },
		{ match: "git rev-parse HEAD", result: { stdout: `${HEAD_SHA}\n` } },
		{ match: `git reset --hard ${PARENT_SHA}`, result: {} },
		{ match: `gt create ${targetBranchName} --no-interactive --no-ai`, result: {} },
		{ match: `git reset --hard ${HEAD_SHA}`, result: {} },
		{ match: "git rev-parse HEAD", result: { stdout: `${HEAD_SHA}\n` } },
		{
			match: `git branch -D ${backupBranchName}`,
			result: { code: options.backupDeleteCode ?? 0, stderr: "delete failed\n" },
		},
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
	];
}

afterEach(() => {
	vi.useRealTimers();
	for (const directory of tempProjectDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl flow branch-latest-commit CLI availability", () => {
	test("branch-latest-commit is not registered as a built-in command after the kernel reset", () => {
		expect(listSdlCommands().some((command) => command.name === "branch-latest-commit")).toBe(
			false,
		);
	});

	test("branch-latest-commit help and invocation are unavailable without a project extension", async () => {
		const help = runUnavailableBranchLatestCli(["flow", "branch-latest-commit", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: sdl");
		expect(help.stdout.join("")).not.toContain("Usage: sdl flow branch-latest-commit");

		for (const args of [
			["flow", "branch-latest-commit"],
			["flow", "branch-latest-commit", "--slug", "x"],
		] as const) {
			const run = runUnavailableBranchLatestCli(args);
			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		}
	});

	test("project-local branch-latest-commit appears in help and JSON schema", async () => {
		const cwd = createBranchLatestCommitProject();

		const help = runWithFakes({ args: ["flow", "branch-latest-commit", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: sdl flow branch-latest-commit");
		expect(output).toContain("--slug");
		expect(output).toContain("clean worktree");
		expect(output).toContain("latest eligible unpushed single-parent commit");
		expect(output).toContain("does not push, publish, submit, or update PRs");
		expect(output).toContain("sdl flow autobranch");
		expect(output).not.toContain("stashes pending changes");

		const schema = runWithFakes({ args: ["flow", "branch-latest-commit", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("input_json_schema");
		expect(schema.stdout.join("")).toContain("latest commit");
		expect(schema.stdout.join("")).toContain("slug");
	});
});

describe("project-local branch-latest-commit extension", () => {
	test("moves clean latest commit with recovery branch verification", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["flow", "branch-latest-commit", "--slug", "extract-commit"],
			state: { exec: cleanLatestCommitResponses(), textGeneration: [] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			[
				"New branch: extract-commit",
				"Moved commit: aaaaaaa Add autobranch",
				"Source branch feature/source reset to bbbbbbb.",
				"Working directory is clean.",
				"",
			].join("\n"),
		);
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual(
			expect.arrayContaining([
				"gt trunk --no-interactive",
				"gt children --no-interactive",
				`git branch autobranch-backup/feature/source/123456789 ${HEAD_SHA}`,
				`git reset --hard ${PARENT_SHA}`,
				"gt create extract-commit --no-interactive --no-ai",
				`git reset --hard ${HEAD_SHA}`,
				"git branch -D autobranch-backup/feature/source/123456789",
			]),
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("refuses dirty worktrees before Graphite or stash mutation", async () => {
		const run = runWithFakes({
			args: ["flow", "branch-latest-commit", "--slug", "extract-commit"],
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/source\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
				],
				textGeneration: [],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("use `sdl flow autobranch`");
		expect(run.stderr.join("")).toContain("requires a clean worktree");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
		expect(run.context.execCalls.some((call) => call.command === "gt")).toBe(false);
		expect(run.context.execCalls.some((call) => call.args.includes("stash"))).toBe(false);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("suffixes when the requested branch exists exactly", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["flow", "branch-latest-commit", "--slug", "extract-commit"],
			state: {
				exec: cleanLatestCommitResponses({
					targetBranchName: "extract-commit-2",
					targetAvailability: [
						...exactExistingBranchResponse("extract-commit"),
						...availableBranchResponses("extract-commit-2"),
					],
				}),
				textGeneration: [],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain(
			"New branch: extract-commit-2 (base slug extract-commit was unavailable)",
		);
		expect(formattedExecCalls(run.context)).toContain(
			"gt create extract-commit-2 --no-interactive --no-ai",
		);
	});

	test("suffixes when an existing child blocks the requested branch", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["flow", "branch-latest-commit", "--slug", "extract-commit"],
			state: {
				exec: cleanLatestCommitResponses({
					targetBranchName: "extract-commit-2",
					targetAvailability: [
						...childExistingBranchResponses("extract-commit", "extract-commit/child"),
						...availableBranchResponses("extract-commit-2"),
					],
				}),
				textGeneration: [],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain(
			"New branch: extract-commit-2 (base slug extract-commit was unavailable)",
		);
		expect(formattedExecCalls(run.context)).toContain(
			"git for-each-ref --format=%(refname:strip=2) refs/heads/extract-commit/*",
		);
		expect(formattedExecCalls(run.context)).toContain(
			"gt create extract-commit-2 --no-interactive --no-ai",
		);
	});

	test("refuses before mutation when recovery branch names are exhausted by a parent ref", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["flow", "branch-latest-commit", "--slug", "extract-commit"],
			state: {
				exec: cleanLatestCommitResponses({
					backupAvailability: parentCollisionExhaustionResponses({
						base: "autobranch-backup/feature/source/123456789",
						parent: "autobranch-backup",
					}),
				}),
				textGeneration: [],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Could not find an available recovery branch name");
		const calls = formattedExecCalls(run.context);
		expect(calls).not.toContain(`git reset --hard ${PARENT_SHA}`);
		expect(calls).not.toContain("gt create extract-commit --no-interactive --no-ai");
		expect(calls).not.toContain(
			`git branch autobranch-backup/feature/source/123456789 ${HEAD_SHA}`,
		);
	});

	test("writes latest-commit recovery cleanup warnings to stderr only", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["flow", "branch-latest-commit", "--slug", "extract-commit"],
			state: { exec: cleanLatestCommitResponses({ backupDeleteCode: 1 }), textGeneration: [] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("New branch: extract-commit");
		expect(run.stdout.join("")).not.toContain("recovery branch");
		expect(run.stderr.join("")).toContain(
			"Warning: recovery branch autobranch-backup/feature/source/123456789 could not be deleted",
		);
	});
});
