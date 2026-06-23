import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { listSdlCommands } from "@sdl/sdl/cli";

import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";
import { installCheckedInFlowExtension } from "../helpers/flow-extension.ts";

const tempProjectDirs: string[] = [];
const CHECKPOINT_MESSAGE = "[cp] Move pending work\n\n- Preserve current changes";

function availableBranchResponses(branchName: string): ScriptedExecResponse[] {
	return [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git show-ref --verify --quiet refs/heads/${branchName}`, result: { code: 1 } },
	];
}

function createAutobranchProject(): string {
	const directory = mkdtempSync(join(tmpdir(), "sdl-autobranch-project-"));
	tempProjectDirs.push(directory);
	installCheckedInFlowExtension(directory);
	return directory;
}

function runUnavailableAutobranchCli(args: readonly string[]) {
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
		{ ...options, cwd: options.cwd ?? createAutobranchProject() },
		{
			execResponses: () => [],
			textGenerationResults: () => [{ ok: true, text: CHECKPOINT_MESSAGE }],
			missingTextGenerationResult: () => ({ ok: true, text: CHECKPOINT_MESSAGE }),
		},
	);
}

function dirtyWorktreeResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/source\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n+export const value = true;\n" },
		},
		...availableBranchResponses("move-work"),
		{
			match: "git stash push --include-untracked -m pi-autobranch:123456789:move-work",
			result: {},
		},
		{
			match: "git stash list --format=%gd%x00%s",
			result: { stdout: "stash@{0}\0On feature/source: pi-autobranch:123456789:move-work\n" },
		},
		{ match: "gt create move-work --no-interactive --no-ai", result: {} },
		{ match: "git stash pop stash@{0}", result: {} },
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc1234 [cp] Move pending work\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
	];
}

function cleanWorktreeSnapshotResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/source\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
	];
}

afterEach(() => {
	vi.useRealTimers();
	for (const directory of tempProjectDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl flow autobranch CLI availability", () => {
	test("autobranch is not registered as a built-in command after the kernel reset", () => {
		expect(listSdlCommands().some((command) => command.name === "autobranch")).toBe(false);
	});

	test("autobranch help and invocation are unavailable without a project extension", async () => {
		const help = runUnavailableAutobranchCli(["flow", "autobranch", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: sdl");
		expect(help.stdout.join("")).not.toContain("Usage: sdl flow autobranch");

		for (const args of [
			["flow", "autobranch"],
			["flow", "autobranch", "--slug", "x"],
		] as const) {
			const run = runUnavailableAutobranchCli(args);
			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		}
	});

	test("project-local autobranch appears in help and JSON schema", async () => {
		const cwd = createAutobranchProject();

		const help = runWithFakes({ args: ["flow", "autobranch", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: sdl flow autobranch");
		expect(output).toContain("--slug");
		expect(output).toContain("gt create");
		expect(output).toContain("dirty worktree changes");
		expect(output).toContain("sdl flow branch-latest-commit");
		expect(output).not.toContain(["eligible unpushed", "non-merge commit"].join(" "));
		expect(output).toContain("SDL_SLUG_MODEL");
		expect(output).toContain("SDL_CHECKPOINT_MODEL");
		expect(output).toContain("SDL_DEV_CHECKPOINT_MODEL");

		const schema = runWithFakes({ args: ["flow", "autobranch", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("input_json_schema");
		expect(schema.stdout.join("")).toContain("slug");
	});
});

describe("project-local autobranch extension", () => {
	test("moves dirty worktree changes to a Graphite branch and checkpoint commit", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["flow", "autobranch", "--slug", "move-work"],
			state: {
				exec: dirtyWorktreeResponses(),
				textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			[
				"New branch: move-work",
				"Stacked on: feature/source",
				"Commit: abc1234 [cp] Move pending work",
				"Working directory is clean.",
				"",
			].join("\n"),
		);
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git check-ref-format --branch move-work",
			"git show-ref --verify --quiet refs/heads/move-work",
			"git stash push --include-untracked -m pi-autobranch:123456789:move-work",
			"git stash list --format=%gd%x00%s",
			"gt create move-work --no-interactive --no-ai",
			"git stash pop stash@{0}",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
			"git status --porcelain=v1",
		]);
		expect(run.context.execCalls.some((call) => call.command === "pi")).toBe(false);
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(run.context.textGeneratorCalls[0]).toMatchObject({
			operation: "checkpoint-message",
			modelRef: "openai-codex/gpt-5.4-mini",
		});
	});

	test("restores stash when Graphite rejects a preflight-available branch name", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["flow", "autobranch", "--slug", "move-work"],
			state: {
				exec: [
					...dirtyWorktreeResponses().slice(0, 8),
					{
						match: "gt create move-work --no-interactive --no-ai",
						result: { code: 1, stderr: "fatal: cannot lock ref\n" },
					},
					{ match: "git stash pop stash@{0}", result: {} },
				],
				textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Failed to create Graphite branch move-work.");
		expect(run.stderr.join("")).toContain("fatal: cannot lock ref");
		expect(run.stderr.join("")).toContain("Restored pending changes to the original branch.");
		expect(formattedExecCalls(run.context)).toContain("git stash pop stash@{0}");
	});

	test("refuses a clean worktree before Graphite, stash, or model calls", async () => {
		const run = runWithFakes({
			args: ["flow", "autobranch", "--slug", "extract-commit"],
			state: { exec: cleanWorktreeSnapshotResponses(), textGeneration: [] },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Working tree is clean");
		expect(run.stderr.join("")).toContain("sdl flow branch-latest-commit");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
		expect(run.context.execCalls.some((call) => call.command === "gt")).toBe(false);
		expect(run.context.execCalls.some((call) => call.args.includes("stash"))).toBe(false);
		expect(run.context.execCalls.some((call) => call.command === "pi")).toBe(false);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("fails with actionable stderr and no success stdout", async () => {
		const run = runWithFakes({
			args: ["flow", "autobranch"],
			state: {
				exec: [
					{
						match: "git rev-parse --show-toplevel",
						result: { code: 128, stderr: "fatal: not a git repo\n" },
					},
				],
				textGeneration: [],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Not inside a git repository.");
		expect(run.stderr.join("")).toContain("fatal: not a git repo");
		expect(run.context.textGeneratorCalls).toEqual([]);
	});
});
