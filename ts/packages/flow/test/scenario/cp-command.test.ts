import { describe, expect, test } from "vitest";

import { runFlowCpCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./sdl-cli-fakes.ts";

function defaultCpMessage(): string {
	return `[cp] Update checkpoint tests

- Add CLI coverage`;
}

function runCpWithFakes(options: Parameters<typeof runFlowCpCommandWithFakes>[0] = {}) {
	return runFlowCpCommandWithFakes(options);
}

function dirtyCpExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint\n" } },
	];
}

function cleanCpExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
	];
}

describe("project-local cp extension behavior", () => {
	test("drafts with the model gateway and commits a valid model message", async () => {
		const message = `[cp] Update CLI checkpoint

- Add command table coverage`;
		const run = runCpWithFakes({
			state: {
				textGeneration: [{ ok: true, text: message }],
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{ match: "git add -A", result: {} },
					{ match: /^git commit -F /, result: {} },
					{
						match: "git log -1 --oneline",
						result: { stdout: "def456 [cp] Update CLI checkpoint\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`def456 [cp] Update CLI checkpoint\n${message}\n`);
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
		]);
		expect(run.context.textGeneratorCalls).toEqual([
			expect.objectContaining({
				modelRef: "openai-codex/gpt-5.4-mini",
				operation: "checkpoint-message",
				maxTokens: 512,
				reasoning: "low",
			}),
		]);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"## git status --porcelain\n\n M src/app.ts",
		);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"## git diff HEAD\n\ndiff --git a/src/app.ts b/src/app.ts",
		);
	});

	test("dry-run previews the checkpoint without staging, committing, or reading log", async () => {
		const run = runCpWithFakes({ request: { dryRun: true } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			`Dry run: would create checkpoint commit on feature/demo\n\n${defaultCpMessage()}\n`,
		);
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
		expect(formattedExecCalls(run.context)).not.toContain("git add -A");
		expect(formattedExecCalls(run.context)).not.toContain("git log -1 --oneline");
	});

	test("checkpoint model can be selected by SDL environment with legacy fallback", async () => {
		const selected = runCpWithFakes({
			env: {
				SDL_CHECKPOINT_MODEL: "openai-codex/custom-mini",
				SDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy",
			},
		});

		expect(await selected.exit).toBe(0);
		expect(selected.context.textGeneratorCalls[0]?.modelRef).toBe("openai-codex/custom-mini");

		const fallback = runCpWithFakes({
			env: { SDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy-mini" },
		});
		expect(await fallback.exit).toBe(0);
		expect(fallback.context.textGeneratorCalls[0]?.modelRef).toBe("openai-codex/legacy-mini");
	});

	test("model generation error exits 2 without committing", async () => {
		const run = runCpWithFakes({
			state: { textGeneration: [{ ok: false, error: "auth failed" }] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("auth failed\n");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("invalid first model output triggers one repair request and commits the repaired message", async () => {
		const repaired = `[cp] Repair checkpoint message

- Keep only valid bullets`;
		const run = runCpWithFakes({
			state: {
				textGeneration: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: repaired },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.context.textGeneratorCalls).toHaveLength(2);
		expect(run.context.textGeneratorCalls[1]?.prompt).toContain(
			"## previous invalid draft\n\nnot a commit message",
		);
		expect(run.context.textGeneratorCalls[1]?.prompt).toContain("missing_cp_prefix");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
		]);
	});

	test("invalid first and repaired output exits 2 without committing", async () => {
		const run = runCpWithFakes({
			state: {
				textGeneration: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: "still invalid" },
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain(
			"Model produced an invalid checkpoint message after 2 attempts.",
		);
		expect(run.stderr.join("")).toContain("missing_cp_prefix");
		expect(run.context.textGeneratorCalls).toHaveLength(2);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("clean worktree exits without model generation or committing", async () => {
		const run = runCpWithFakes({
			state: { exec: cleanCpExecResponses() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Working tree is clean; nothing to checkpoint.\n");
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("trunk branch exits before clean-worktree rejection or model generation", async () => {
		const run = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "main\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: "" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toBe(
			"Refusing to create checkpoint commit on trunk branch: main\n",
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("snapshot git failures exit with typed diagnostics", async () => {
		const notGit = runCpWithFakes({
			state: {
				exec: [
					{
						match: "git rev-parse --show-toplevel",
						result: { code: 128, stderr: "fatal: not a git repository" },
					},
				],
			},
		});

		expect(await notGit.exit).toBe(2);
		expect(notGit.stderr.join("")).toBe(
			"Not inside a git repository.\nexit 128: fatal: not a git repository\n",
		);
		expect(notGit.context.textGeneratorCalls).toEqual([]);

		const detached = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{
						match: "git symbolic-ref --short HEAD",
						result: { code: 1, stderr: "fatal: ref HEAD is not a symbolic ref" },
					},
				],
			},
		});
		expect(await detached.exit).toBe(2);
		expect(detached.stderr.join("")).toBe(
			"Could not determine current branch.\nexit 1: fatal: ref HEAD is not a symbolic ref\n",
		);

		const statusFailed = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { code: 1, stderr: "index locked" } },
				],
			},
		});
		expect(await statusFailed.exit).toBe(2);
		expect(statusFailed.stderr.join("")).toBe(
			"Could not inspect git status.\nexit 1: index locked\n",
		);

		const diffFailed = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{ match: "git diff HEAD --no-ext-diff", result: { code: 1, stderr: "diff failed" } },
				],
			},
		});
		expect(await diffFailed.exit).toBe(2);
		expect(diffFailed.stderr.join("")).toBe("Could not capture git diff.\nexit 1: diff failed\n");
	});

	test("commit operation failures exit with useful stderr", async () => {
		const addFailed = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{ match: "git add -A", result: { code: 1, stderr: "index locked" } },
				],
			},
		});

		expect(await addFailed.exit).toBe(2);
		expect(addFailed.stdout.join("")).toBe("");
		expect(addFailed.stderr.join("")).toBe(
			"Failed to stage checkpoint changes.\nexit 1: index locked\n",
		);

		const commitFailed = runCpWithFakes({
			state: {
				exec: [
					...dirtyCpExecResponses().slice(0, 5),
					{ match: /^git commit -F /, result: { code: 1, stderr: "nothing to commit" } },
				],
			},
		});
		expect(await commitFailed.exit).toBe(2);
		expect(commitFailed.stderr.join("")).toBe(
			"Checkpoint commit failed.\nexit 1: nothing to commit\n",
		);

		const logFailed = runCpWithFakes({
			state: {
				exec: [
					...dirtyCpExecResponses().slice(0, 6),
					{ match: "git log -1 --oneline", result: { code: 1, stderr: "log failed" } },
				],
			},
		});
		expect(await logFailed.exit).toBe(2);
		expect(logFailed.stderr.join("")).toBe(
			"Created checkpoint commit, but failed to read it back.\nexit 1: log failed\n",
		);
	});
});
