import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

const AUTOBRANCH_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/autobranch.ts", import.meta.url),
);
const tempProjectDirs: string[] = [];
const CHECKPOINT_MESSAGE = "[cp] Move pending work\n\n- Preserve current changes";
const HEAD_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PARENT_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function createAutobranchProject(): string {
	const directory = mkdtempSync(join(tmpdir(), "sdl-autobranch-project-"));
	tempProjectDirs.push(directory);
	const extensionPath = join(directory, ".sdl", "extensions", "autobranch.ts");
	mkdirSync(dirname(extensionPath), { recursive: true });
	copyFileSync(AUTOBRANCH_EXTENSION_SOURCE, extensionPath);
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
		{ match: "git check-ref-format --branch move-work", result: {} },
		{ match: "git show-ref --verify --quiet refs/heads/move-work", result: { code: 1 } },
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

function cleanLatestCommitResponses(
	options: { backupDeleteCode?: number } = {},
): ScriptedExecResponse[] {
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
		{ match: "git check-ref-format --branch extract-commit", result: {} },
		{
			match: "git show-ref --verify --quiet refs/heads/extract-commit",
			result: { code: 1 },
		},
		{ match: "git branch --show-current", result: { stdout: "feature/source\n" } },
		{
			match: "git for-each-ref --format=%(upstream:short) refs/heads/feature/source",
			result: { stdout: "" },
		},
		{
			match: "git check-ref-format --branch autobranch-backup/feature/source/123456789",
			result: {},
		},
		{
			match: "git show-ref --verify --quiet refs/heads/autobranch-backup/feature/source/123456789",
			result: { code: 1 },
		},
		{
			match: `git branch autobranch-backup/feature/source/123456789 ${HEAD_SHA}`,
			result: {},
		},
		{ match: "git branch --show-current", result: { stdout: "feature/source\n" } },
		{ match: "git rev-parse HEAD", result: { stdout: `${HEAD_SHA}\n` } },
		{ match: `git reset --hard ${PARENT_SHA}`, result: {} },
		{ match: "gt create extract-commit --no-interactive --no-ai", result: {} },
		{ match: `git reset --hard ${HEAD_SHA}`, result: {} },
		{ match: "git rev-parse HEAD", result: { stdout: `${HEAD_SHA}\n` } },
		{
			match: "git branch -D autobranch-backup/feature/source/123456789",
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

describe("sdl autobranch CLI availability", () => {
	test("autobranch is not registered as a built-in command after the kernel reset", () => {
		expect(listSdlCommands().some((command) => command.name === "autobranch")).toBe(false);
	});

	test("autobranch help and invocation are unavailable without a project extension", async () => {
		const help = runUnavailableAutobranchCli(["autobranch", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: sdl");
		expect(help.stdout.join("")).not.toContain("Usage: sdl autobranch");

		for (const args of [["autobranch"], ["autobranch", "--slug", "x"]] as const) {
			const run = runUnavailableAutobranchCli(args);
			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.modelCalls).toEqual([]);
		}
	});

	test("project-local autobranch appears in help and JSON schema", async () => {
		const cwd = createAutobranchProject();

		const help = runWithFakes({ args: ["autobranch", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: sdl autobranch");
		expect(output).toContain("--slug");
		expect(output).toContain("gt create");
		expect(output).toContain("eligible unpushed non-merge commit");
		expect(output).toContain("SDL_SLUG_MODEL");
		expect(output).toContain("SDL_CHECKPOINT_MODEL");
		expect(output).toContain("SDL_DEV_CHECKPOINT_MODEL");

		const schema = runWithFakes({ args: ["autobranch", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("input_json_schema");
		expect(schema.stdout.join("")).toContain("slug");
	});
});

describe("project-local autobranch extension", () => {
	test("moves dirty worktree changes to a Graphite branch and checkpoint commit", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["autobranch", "--slug", "move-work"],
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
		expect(run.context.modelCalls).toHaveLength(1);
		expect(run.context.modelCalls[0]).toMatchObject({
			operation: "checkpoint-message",
			modelRef: "openai-codex/gpt-5.4-mini",
		});
	});

	test("moves clean latest commit with recovery branch verification", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["autobranch", "--slug", "extract-commit"],
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
		expect(run.context.modelCalls).toEqual([]);
	});

	test("writes latest-commit recovery cleanup warnings to stderr only", async () => {
		vi.setSystemTime(new Date(123456789));
		const run = runWithFakes({
			args: ["autobranch", "--slug", "extract-commit"],
			state: { exec: cleanLatestCommitResponses({ backupDeleteCode: 1 }), textGeneration: [] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("New branch: extract-commit");
		expect(run.stdout.join("")).not.toContain("recovery branch");
		expect(run.stderr.join("")).toContain(
			"Warning: recovery branch autobranch-backup/feature/source/123456789 could not be deleted",
		);
	});

	test("fails with actionable stderr and no success stdout", async () => {
		const run = runWithFakes({
			args: ["autobranch"],
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
		expect(run.context.modelCalls).toEqual([]);
	});
});
