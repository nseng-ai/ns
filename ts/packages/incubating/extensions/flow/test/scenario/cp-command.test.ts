import { describe, expect, test } from "vitest";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import type { NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";

import { runFlowCpCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

// A non-tty transient line, as routed to onOutput (the Pi widget path / captured liveOutput).
function transient(text: string): { stream: "stderr"; text: string } {
	return { stream: "stderr", text: `${text}\n` };
}

function expectPlainHostedOutput(
	entries: readonly { stream: "stdout" | "stderr"; text: string }[],
): void {
	for (const entry of entries) {
		expect(entry.text).toBe(stripAnsi(entry.text));
		expect(entry.text).not.toContain("\r");
	}
}

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
		{
			match: "git symbolic-ref --short refs/remotes/origin/HEAD",
			result: { stdout: "origin/main\n" },
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
		{
			match: "git symbolic-ref --short refs/remotes/origin/HEAD",
			result: { stdout: "origin/main\n" },
		},
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
					{
						match: "git symbolic-ref --short refs/remotes/origin/HEAD",
						result: { stdout: "origin/main\n" },
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
			"git symbolic-ref --short refs/remotes/origin/HEAD",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
		]);
		expect(run.context.textGeneratorCalls).toEqual([
			expect.objectContaining({
				modelSelection: {
					provider: "openai-codex",
					modelId: "gpt-5.6-luna",
					thinking: "minimal" as const,
				},
				operation: "checkpoint-message",
				maxTokens: 512,
			}),
		]);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"## git status --porcelain\n\n M src/app.ts",
		);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"## git diff HEAD\n\ndiff --git a/src/app.ts b/src/app.ts",
		);
	});

	test("live structured progress owns presentation despite inherited TTY caps", async () => {
		const events: NsProgressPhaseEvent[] = [];
		const progress: NsProgress = { isLive: true, phase: (event) => events.push(event) };
		const run = runCpWithFakes({
			progress,
			renderCapabilities: {
				canEmitAnsi: false,
				caps: {
					isTty: true,
					colorDepth: "truecolor",
					columns: 195,
					canRenderUnicode: true,
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(events.map((event) => event.type)).toEqual([
			"phases-declared",
			"phase-started",
			"phase-started",
			"phase-progress",
			"phase-started",
			"phase-done",
		]);
		expect(events.at(-1)).toEqual({ type: "phase-done", phaseKey: "commit" });
		expect(run.liveOutput).toEqual([]);
		expect(run.stdout.join("")).toContain("abc123 [cp] Update checkpoint");
		expect(run.stderr.join("")).toBe("");
	});

	test("non-live non-TTY progress keeps transient and settled stream output", async () => {
		const run = runCpWithFakes();

		expect(await run.exit).toBe(0);
		expectPlainHostedOutput(run.liveOutput);
		expect(run.liveOutput.slice(0, 4)).toEqual([
			transient("inspecting worktree…"),
			transient("generating checkpoint message…"),
			transient("• Generating checkpoint message with model…"),
			transient("creating checkpoint commit…"),
		]);
		expect(run.liveOutput).toHaveLength(5);
		const settled = run.liveOutput[4];
		expect(settled?.stream).toBe("stderr");
		expect(settled?.text).toContain("ns flow cp");
		expect(settled?.text).toContain("worktree inspected");
		expect(settled?.text).toContain("checkpoint message ready");
		expect(settled?.text).toContain("checkpoint committed");
		expect(settled?.text).not.toContain("pending");
		expect(run.stderr.join("")).toBe("");
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
			"git symbolic-ref --short refs/remotes/origin/HEAD",
		]);
		expect(formattedExecCalls(run.context)).not.toContain("git add -A");
		expect(formattedExecCalls(run.context)).not.toContain("git log -1 --oneline");
	});

	test("checkpoint generation receives the resolved model reference explicitly", async () => {
		const run = runCpWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.context.textGeneratorCalls[0]?.modelSelection).toEqual({
			provider: "openai-codex",
			modelId: "gpt-5.6-luna",
			thinking: "minimal",
		});
	});

	test("model generation error exits 2 without committing", async () => {
		const run = runCpWithFakes({
			state: { textGeneration: [{ ok: false, error: "auth failed" }] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: auth failed\n");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git symbolic-ref --short refs/remotes/origin/HEAD",
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
			"git symbolic-ref --short refs/remotes/origin/HEAD",
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
			"git symbolic-ref --short refs/remotes/origin/HEAD",
		]);
	});

	test("clean worktree keeps semantic refusal visible without hosted progress output", async () => {
		const events: NsProgressPhaseEvent[] = [];
		const run = runCpWithFakes({
			progress: { isLive: true, phase: (event) => events.push(event) },
			renderCapabilities: {
				canEmitAnsi: false,
				caps: {
					isTty: true,
					colorDepth: "truecolor",
					columns: 195,
					canRenderUnicode: true,
				},
			},
			state: { exec: cleanCpExecResponses() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Working tree is clean; nothing to checkpoint.\n");
		expect(run.liveOutput).toEqual([]);
		expect(events.some((event) => event.type === "phases-declared")).toBe(true);
		expect(events.at(-1)).toEqual({
			type: "phase-failed",
			phaseKey: "inspect",
			detail: "inspecting worktree…",
		});
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git symbolic-ref --short refs/remotes/origin/HEAD",
		]);
	});

	test("configured trunk branch exits before clean-worktree rejection or model generation", async () => {
		const run = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "release\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: "" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
					{
						match: "git symbolic-ref --short refs/remotes/origin/HEAD",
						result: { stdout: "origin/release\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toBe(
			"Refusing to create checkpoint commit on trunk branch: release\n",
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git symbolic-ref --short refs/remotes/origin/HEAD",
		]);
	});

	test("--force creates a checkpoint on trunk without checking cached origin/HEAD", async () => {
		const run = runCpWithFakes({
			request: { force: true },
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "main\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{ match: "git add -A", result: {} },
					{ match: /^git commit -F /, result: {} },
					{
						match: "git log -1 --oneline",
						result: { stdout: "abc123 [cp] Update checkpoint\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("abc123 [cp] Update checkpoint");
		expect(formattedExecCalls(run.context)).not.toContain(
			"git symbolic-ref --short refs/remotes/origin/HEAD",
		);
		expect(formattedExecCalls(run.context)).toContain("git add -A");
	});

	test("Git trunk resolution failure stops before clean refusal or model generation", async () => {
		const run = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: "" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
					{
						match: "git symbolic-ref --short refs/remotes/origin/HEAD",
						result: { code: 2, stderr: "git symbolic-ref unavailable" },
					},
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			"Could not resolve the Git trunk branch from cached `refs/remotes/origin/HEAD`; checkpoint was not created.",
		);
		expect(run.stderr.join("")).toContain("git symbolic-ref unavailable");
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git symbolic-ref --short refs/remotes/origin/HEAD",
		]);
	});

	test("missing cached remote HEAD fails closed before clean refusal, model, or mutation", async () => {
		const run = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: "" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
					{
						match: "git symbolic-ref --short refs/remotes/origin/HEAD",
						result: { code: 1, stderr: "fatal: ref is not a symbolic ref" },
					},
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			"Could not resolve the Git trunk branch from cached `refs/remotes/origin/HEAD`; checkpoint was not created.",
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).not.toContain("git add -A");
	});

	test("repository and snapshot git failures exit with typed diagnostics", async () => {
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
			"error: Could not determine the repository root for ns.toml.\n",
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
			"error: Could not determine current branch.\nexit code 1: fatal: ref HEAD is not a symbolic ref\n",
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
			"error: Could not inspect git status.\nexit code 1: index locked\n",
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
		expect(diffFailed.stderr.join("")).toBe(
			"error: Could not capture git diff.\nexit code 1: diff failed\n",
		);
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
					{
						match: "git symbolic-ref --short refs/remotes/origin/HEAD",
						result: { stdout: "origin/main\n" },
					},
					{ match: "git add -A", result: { code: 1, stderr: "index locked" } },
				],
			},
		});

		expect(await addFailed.exit).toBe(2);
		expect(addFailed.stdout.join("")).toBe("");
		expect(addFailed.stderr.join("")).toBe(
			"error: Failed to stage checkpoint changes.\nexit 1: index locked\n",
		);

		const commitFailed = runCpWithFakes({
			state: {
				exec: [
					...dirtyCpExecResponses().slice(0, 6),
					{ match: /^git commit -F /, result: { code: 1, stderr: "nothing to commit" } },
				],
			},
		});
		expect(await commitFailed.exit).toBe(2);
		expect(commitFailed.stderr.join("")).toBe(
			"error: Checkpoint commit failed.\nexit 1: nothing to commit\n",
		);

		const logFailed = runCpWithFakes({
			state: {
				exec: [
					...dirtyCpExecResponses().slice(0, 7),
					{ match: "git log -1 --oneline", result: { code: 1, stderr: "log failed" } },
				],
			},
		});
		expect(await logFailed.exit).toBe(2);
		expect(logFailed.stderr.join("")).toBe(
			"error: Created checkpoint commit, but failed to read it back.\nexit 1: log failed\n",
		);
	});
});
