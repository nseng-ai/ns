import { rmSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { stripAnsi } from "@sdl/clinkr/testing";
import {
	DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT,
	PR_DESCRIPTION_GENERATOR_VERSION,
	formatManagedGeneratedRegion,
	hashPrDescriptionPrompt,
} from "../../src/submit/index.ts";
import type { TextGenerationResult } from "@sdl/kernel/sdk";

import { runFlowSubmitCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./sdl-cli-fakes.ts";

// A non-tty transient progress line, as routed to onOutput (the Pi widget path / captured liveOutput).
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

function lastStderrOutput(
	entries: readonly { stream: "stdout" | "stderr"; text: string }[],
): string {
	return entries.findLast((entry) => entry.stream === "stderr")?.text ?? "";
}

const PR_URL = "https://github.com/acme/repo/pull/123";
const GRAPHITE_PR_URL = "https://app.graphite.com/github/pr/acme/repo/123";
const LAGGING_VERIFICATION_PR_URL = "https://app.graphite.com/github/pr/dagster-io/sdl-tools/1517";
const tempDirs: string[] = [];

afterEach(() => {
	vi.useRealTimers();
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function runWithFakes(options: Parameters<typeof runFlowSubmitCommandWithFakes>[0] = {}) {
	return runFlowSubmitCommandWithFakes({
		...options,
		defaults: {
			execResponses: successfulSubmitResponses,
			textGenerationResults: () => [{ ok: true, text: defaultPrDescriptionText() }],
			missingTextGenerationResult: () => ({ ok: true, text: defaultPrDescriptionText() }),
		},
	});
}

function cleanCheckpointResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
	];
}

function dirtyCheckpointResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Submit checkpoint\n" } },
	];
}

function successfulSubmitResponses(options: { force?: boolean } = {}): ScriptedExecResponse[] {
	const submitCommand = options.force
		? "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force"
		: "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web";
	const submitDryRunCommand = `${submitCommand} --dry-run`;
	return [
		...cleanCheckpointResponses(),
		{
			match: submitDryRunCommand,
			result: { stdout: "ready\n" },
		},
		{
			match: "gt log --stack --reverse --no-interactive",
			result: { stdout: "◯ main\n◉ feature/demo (current)\n" },
		},
		{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
		{
			match: "gt branch info --no-interactive --branch feature/demo",
			result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
		},
		{
			match: submitCommand,
			result: { stdout: `Submitted ${PR_URL}\n` },
		},
		{ match: "gt branch info --no-interactive", result: { stdout: `Current PR: ${PR_URL}\n` } },
		{
			match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
			result: { stdout: prJson({ body: "Hand edited body" }) },
		},
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
		{
			match: "git patch-id --stable",
			result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
		},
		{ match: /^gh pr edit 123 --title Generated PR --body-file /, result: {} },
	];
}

function prJson(
	options: { body: string; title?: string; headRefName?: string } = { body: "" },
): string {
	return JSON.stringify({
		number: 123,
		url: PR_URL,
		title: options.title ?? "Existing PR title",
		body: options.body,
		headRefName: options.headRefName ?? "feature/demo",
		baseRefName: "main",
	});
}

function commitsJson(): string {
	return JSON.stringify({
		commits: [{ messageHeadline: "Add submit", messageBody: "Body from commit" }],
	});
}

function defaultPrDescriptionText(): string {
	return "Generated PR\n\nGenerated body";
}

describe("project-local submit extension", () => {
	test("clean success submits, verifies current PR, prints quiet progress, and rewrites PR bodies", async () => {
		const run = runWithFakes({
			state: {
				textGeneration: [
					{
						ok: true,
						text: defaultPrDescriptionText(),
						usage: { inputTokens: 1234, outputTokens: 56 },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Submitted 1 PR:");
		expect(output).toContain(`✓ #123 ${PR_URL}`);
		expect(output).toContain("description updated");
		expect(output).not.toContain("gt submit succeeded");
		expect(output).not.toContain("PRs:");
		expect(output).not.toContain("Updated PR descriptions after submit");
		expect(run.stderr.join("")).toBe("");
		expectPlainHostedOutput(run.liveOutput);
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				transient("checkpointing pending changes…"),
				transient("inspecting worktree…"),
				transient("checking submit readiness…"),
				transient("inspecting stack and preparing PR metadata if needed…"),
				transient(
					"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
				),
				transient("checking submitted PRs…"),
				transient("checking 1 PR description for skip or regeneration"),
				transient("preparing descriptions for 1 PR"),
				transient("loading PR #123 metadata (1/1)"),
				transient("resolving PR description prompt and model"),
				transient("checking PR #123 description fingerprint"),
				transient("recomputing PR #123 description (no generated fingerprint found)"),
				transient("generating PR metadata (attempt 1/2)"),
				transient("PR metadata generated (tokens in 1234, out 56)"),
				transient("updating PR #123 description"),
				transient("finished PR #123 description"),
			]),
		);
		const settled = lastStderrOutput(run.liveOutput);
		expect(settled).toContain("sdl flow submit");
		expect(settled).toContain("checkpoint complete");
		expect(settled).toContain("ready to submit");
		expect(settled).toContain("metadata prepared");
		expect(settled).toContain("stack submitted");
		expect(settled).toContain("PRs verified");
		expect(settled).toContain("descriptions ready");
		// The gt submit phase streams its raw output live even without --verbose.
		expect(run.liveOutput).toContainEqual({ stream: "stdout", text: `Submitted ${PR_URL}\n` });
		// Preflight dry-run output stays quiet unless --verbose is passed.
		expect(run.liveOutput).not.toContainEqual({ stream: "stdout", text: "ready\n" });
		expect(formattedExecCalls(run.context)).toContain("gt branch info --no-interactive");
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt branch info --no-interactive --branch main",
		);
		expect(formattedExecCalls(run.context)).toContain("gh pr diff 123");
		expect(formattedExecCalls(run.context)).toContainEqual(
			expect.stringMatching(/^gh pr edit 123 --title Generated PR --body-file /),
		);
	});

	test("--verbose streams raw Graphite output in addition to concise progress", async () => {
		const run = runWithFakes({ request: { verbose: true } });

		expect(await run.exit).toBe(0);
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				transient("checking submit readiness…"),
				{ stream: "stdout", text: "ready\n" },
				transient(
					"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
				),
				{ stream: "stdout", text: `Submitted ${PR_URL}\n` },
			]),
		);
	});

	test("--force passes --force to Graphite submit readiness and submit", async () => {
		const run = runWithFakes({
			request: { force: true },
			state: { exec: successfulSubmitResponses({ force: true }) },
		});

		expect(await run.exit).toBe(0);
		expect(formattedExecCalls(run.context)).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force --dry-run",
		);
		expect(formattedExecCalls(run.context)).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force",
		);
	});

	test("matching PR description fingerprint skips model generation and PR edits", async () => {
		const managedBody = formatManagedGeneratedRegion("Generated body", {
			version: "2",
			patchId: "default-patch-id",
			promptHash: hashPrDescriptionPrompt(DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT),
			generator: PR_DESCRIPTION_GENERATOR_VERSION,
		});
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: { stdout: "◯ main\n◉ feature/demo (current)\n" },
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
					{
						match: "gt branch info --no-interactive --branch feature/demo",
						result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: `Submitted ${PR_URL}\n` },
					},
					{
						match: "gt branch info --no-interactive",
						result: { stdout: `Current PR: ${PR_URL}\n` },
					},
					{
						match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
						result: { stdout: prJson({ body: `Human intro\n\n${managedBody}\n\nHuman footer` }) },
					},
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{
						match: "git patch-id --stable",
						result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Skipped unchanged PR descriptions");
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.liveOutput).toContainEqual(
			transient("skipping PR #123 description; generated fingerprint is unchanged"),
		);
		expect(formattedExecCalls(run.context)).not.toContain("gh pr view 123 --json commits");
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gh pr edit 123"))).toBe(
			false,
		);
	});

	test("post-submit PR description model progress includes an elapsed counter while waiting", async () => {
		vi.useFakeTimers();
		let resolveModel: ((result: TextGenerationResult) => void) | undefined;
		const pendingModel = new Promise<TextGenerationResult>((resolve) => {
			resolveModel = resolve;
		});
		const run = runWithFakes({
			state: { textGeneration: [pendingModel] },
		});

		await vi.waitFor(
			() => {
				expect(run.context.textGeneratorCalls).toHaveLength(1);
			},
			{ timeout: 10_000 },
		);
		expect(run.liveOutput).toContainEqual(transient("generating PR metadata (attempt 1/2)"));

		await vi.advanceTimersByTimeAsync(5_000);
		expect(run.liveOutput).toContainEqual(transient("still generating PR metadata (5s elapsed)"));

		await vi.advanceTimersByTimeAsync(5_000);
		expect(run.liveOutput).toContainEqual(transient("still generating PR metadata (10s elapsed)"));

		resolveModel?.({ ok: true, text: defaultPrDescriptionText() });
		expect(await run.exit).toBe(0);
	});

	test("pre-submit metadata preparation reports progress across large stacks", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: {
							stdout: "◯ main\n◯ feature/base\n◉ feature/top (current)\n◯ feature/upstack\n",
						},
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
					{
						match: "gt branch info --no-interactive --branch feature/base",
						result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
					},
					{
						match: "gt branch info --no-interactive --branch feature/top",
						result: { stdout: "Parent: feature/base\n" },
					},
					{
						match: "git log --format=%B%x00 feature/base..feature/top",
						result: { stdout: "Add top branch\0" },
					},
					{
						match: "git diff feature/base..feature/top",
						result: { stdout: "diff --git a/src/top.ts b/src/top.ts\n" },
					},
					{ match: "git status --porcelain", result: { stdout: "" } },
					{ match: "gt modify --no-interactive -m Generated PR -m Generated body", result: {} },
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: `Submitted ${PR_URL}\n` },
					},
					{
						match: "gt branch info --no-interactive",
						result: { stdout: `Current PR: ${PR_URL}\n` },
					},
					{
						match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
						result: {
							stdout: prJson({
								title: "Generated PR",
								body: "Generated body",
								headRefName: "feature/top",
							}),
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Submitted 1 PR:");
		expect(output).toContain("initial metadata prepared");
		expect(output).not.toContain("Prepared initial PR metadata:");
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				transient("inspecting Graphite submit scope before metadata preparation"),
				transient("inspecting Graphite submit branch metadata for 2 branches"),
				transient("inspecting PR metadata for feature/base (1/2)"),
				transient("inspecting PR metadata for feature/top (2/2)"),
				transient("reading local commits and diff for feature/top"),
				transient("found 2 submit branches; 1 new single-commit branch needs initial PR metadata"),
				transient("generating initial PR metadata for feature/top (1/1)"),
				transient("checking clean worktree before metadata amendment"),
				transient("amending local PR metadata commit for feature/top (1/1)"),
				transient("prepared pre-submit PR metadata for 1 branch"),
			]),
		);
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt branch info --no-interactive --branch feature/upstack",
		);
		expect(formattedExecCalls(run.context)).not.toContain(
			"git log --format=%B%x00 feature/top..feature/upstack",
		);
		expect(formattedExecCalls(run.context)).not.toContain("git diff feature/top..feature/upstack");
	});

	test("accepts submit-output PR links when current PR verification lags", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: { stdout: "◯ main\n◉ feature/demo (current)\n" },
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
					{
						match: "gt branch info --no-interactive --branch feature/demo",
						result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: {
							stdout: `implicit-session-resolution-feedback-read-helpers: ${LAGGING_VERIFICATION_PR_URL} (created)\n`,
						},
					},
					{
						match: "gt branch info --no-interactive",
						result: {
							stdout: "implicit-session-resolution-feedback-read-helpers\n6 seconds ago\n",
						},
					},
					{
						match: "gh pr view 1517 --json number,url,title,body,headRefName,baseRefName",
						result: {
							stdout: JSON.stringify({
								number: 1517,
								url: LAGGING_VERIFICATION_PR_URL,
								title: "Existing PR title",
								body: "Hand edited body",
								headRefName: "feature/demo",
								baseRefName: "main",
							}),
						},
					},
					{ match: "gh pr view 1517 --json commits", result: { stdout: commitsJson() } },
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{
						match: "gh pr diff 1517",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{
						match: "git patch-id --stable",
						result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
					},
					{
						match: "gh pr diff 1517",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{ match: /^gh pr edit 1517 --title Generated PR --body-file /, result: {} },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Submitted 1 PR:");
		expect(run.stdout.join("")).toContain(`#1517 ${LAGGING_VERIFICATION_PR_URL}`);
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toContain("gt branch info --no-interactive");
	});

	test("deduplicates the submitted PR when Graphite and GitHub URL forms differ", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: { stdout: "◯ main\n◉ feature/demo (current)\n" },
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
					{
						match: "gt branch info --no-interactive --branch feature/demo",
						result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: `Submitted ${GRAPHITE_PR_URL}\n` },
					},
					{
						match: "gt branch info --no-interactive",
						result: { stdout: `Current PR: ${PR_URL}\n` },
					},
					{
						match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
						result: { stdout: prJson({ body: "Hand edited body" }) },
					},
					{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{
						match: "git patch-id --stable",
						result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
					},
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{ match: /^gh pr edit 123 --title Generated PR --body-file /, result: {} },
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output.match(/^✓ #123 /gm)).toHaveLength(1);
		expect(output).toContain(`✓ #123 ${GRAPHITE_PR_URL}`);
		expect(output).not.toContain(PR_URL);
	});

	test("post-submit no-current-PR failure gives checkpoint guidance", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: { stdout: "◯ main\n◉ feature/demo (current)\n" },
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
					{
						match: "gt branch info --no-interactive --branch feature/demo",
						result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: "Submitted stack without PR URL\n" },
					},
					{
						match: "gt branch info --no-interactive",
						result: { code: 1, stderr: "No PR found for current branch.\n" },
					},
				],
				textGeneration: [{ ok: false, error: "summary unavailable" }],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("gt submit exited 0, but the current branch still has no PR.");
		expect(error).toContain("Submitted stack without PR URL");
		expect(error).toContain(
			"`sdl flow submit` checkpoints outstanding worktree changes before submitting.",
		);
		expect(error).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
	});

	test("dirty worktree checkpoints before submitting", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...dirtyCheckpointResponses(),
					...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
				],
				textGeneration: [{ ok: true, text: "[cp] Submit checkpoint\n\n- Capture dirty work" }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("abc123 [cp] Submit checkpoint");
		expect(formattedExecCalls(run.context)).toEqual(
			expect.arrayContaining([
				"git add -A",
				expect.stringMatching(/^git commit -F /),
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
			]),
		);
	});

	test("checkpoint failure aborts before Graphite submit", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
				],
				textGeneration: [
					{ ok: false, error: "model unavailable" },
					{ ok: false, error: "submit failure interpretation unavailable" },
				],
			},
		});

		expect(await run.exit).toBe(2);
		const error = run.stderr.join("");
		expect(error).toContain("Checkpoint before submit failed. Submission was not attempted.");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain(
			"sdl flow submit failed, and the failure could not be interpreted automatically.",
		);
		expect(error).not.toContain("submit failure interpretation unavailable");
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gt submit"))).toBe(
			false,
		);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"Checkpoint before submit failed. Submission was not attempted.",
		);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("model unavailable");
	});

	test("restack-required dry-run runs restack by default", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "branch must be restacked before submitting\n" },
					},
					{ match: "gt restack --downstack --no-interactive", result: { stdout: "restacked\n" } },
					...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
				],
				confirm: () => {
					throw new Error("confirm should not be called for default restack");
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(formattedExecCalls(run.context)).toContain("gt restack --downstack --no-interactive");
	});

	test("trunk-out-of-date dry-run failure is deterministic and skips model summarization", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout: "Running submit in 'dry-run' mode...\n",
							stderr:
								"ERROR: Aborting submit because trunk branch is out of date and could not be updated.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"Graphite could not update your local trunk before submitting. Nothing was submitted.",
		);
		expect(error).toContain("Fix: update or repair your local trunk checkout");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("----- stdout -----");
		expect(error).not.toContain("ERROR: Aborting submit because trunk branch is out of date");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
	});

	test("remotely updated branch dry-run failure explains what changed outside Graphite", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout:
								"Running submit in 'dry-run' mode. No branches will be pushed and no PRs will be opened or updated.\n\n🥞 Validating that this Graphite stack is ready to submit...\n",
							stderr:
								"ERROR: Branch add-preflight-detect-and-skip-empty-branches has been updated remotely outside of Graphite. Use gt get or gt sync to sync with remote before submitting (or use the --force flag to override this check).\n",
						},
					},
					{
						match: "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
						result: { stdout: "origin/add-preflight-detect-and-skip-empty-branches\n" },
					},
					{
						match:
							"git rev-list --left-right --count HEAD...origin/add-preflight-detect-and-skip-empty-branches",
						result: { stdout: "35\t1\n" },
					},
					{
						match:
							"git log --format=%h %s --max-count=3 origin/add-preflight-detect-and-skip-empty-branches --not HEAD",
						result: { stdout: "abc123 remote checkpoint\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"Branch add-preflight-detect-and-skip-empty-branches is out of sync with its upstream PR branch, so Graphite blocked the submit. Nothing was submitted.",
		);
		expect(error).toContain(
			"Remote checked: origin/add-preflight-detect-and-skip-empty-branches (this is the PR branch, not trunk/master).",
		);
		expect(error).toContain(
			"Why: local HEAD is 35 commits ahead of and 1 commit behind origin/add-preflight-detect-and-skip-empty-branches.",
		);
		expect(error).toContain(
			"Possible cause: the PR branch was pushed/submitted from another checkout, or this local branch was rewritten after an earlier submit.",
		);
		expect(error).toContain(
			"Remote-only commits on origin/add-preflight-detect-and-skip-empty-branches (not in local HEAD):\n  - abc123 remote checkpoint",
		);
		expect(error).toContain("Fix:    run `gt sync` (or `gt get`), then rerun `sdl flow submit`.");
		expect(error).toContain(
			"Bypass: `sdl flow submit --force` skips Graphite's remote-update check.",
		);
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("Problem: Branch");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"has been updated remotely outside of Graphite",
		);
	});

	test("merged PR missing from trunk dry-run failure gives deterministic guidance", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout:
								"Running submit in 'dry-run' mode.\n\n🥞 Validating that this Graphite stack is ready to submit...\n\n▸ handoff-capability/stack-feedback-remediation - PR #2257 (merged)\n",
							stderr:
								"WARNING: PR for the following branch has already been merged but the merged commits are not contained in the latest trunk branch master.\nWARNING: Stacks with this branch will not be submitted:\nWARNING: To submit these stacks, ensure the trunk branch contains the merged PRs in the stack or move the branches onto a trunk that does contain the merged PRs.\nWARNING: PR for the following branch has already been merged or closed:\nERROR: Aborting dry run.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"A merged PR in this stack is not in trunk master, so Graphite will not submit the stack. Nothing was submitted.",
		);
		expect(error).toContain(
			"Branch handoff-capability/stack-feedback-remediation (PR #2257, merged); trunk master.",
		);
		expect(error).toContain(
			"Fix: ensure master contains the merged PR's commits, or reparent handoff-capability/stack-feedback-remediation onto a trunk that already contains them, then rerun `sdl flow submit`.",
		);
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("failed with exit code 1. Submission was not attempted.");
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
	});

	test("merged PR missing from trunk final submit preflight gives deterministic guidance", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: { stdout: "◯ master\n◉ shared-import-scanner-test-helpers (current)\n" },
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "master\n" } },
					{
						match: "gt branch info --no-interactive --branch shared-import-scanner-test-helpers",
						result: {
							stdout: "Parent: master\nPR: https://github.com/dagster-io/sdl-tools/pull/2289\n",
						},
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: {
							code: 1,
							stdout:
								"Running in non-interactive mode.\n\n🥞 Validating that this Graphite stack is ready to submit...\n\n▸ shared-import-scanner-test-helpers - PR #2289 (merged)\n",
							stderr:
								"WARNING: PR for the following branch has already been merged but the merged commits are not contained in the latest trunk branch master.\nWARNING: Stacks with this branch will not be submitted:\nERROR: Aborting submit.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"A merged PR in this stack is not in trunk master, so Graphite will not submit the stack. Nothing was submitted.",
		);
		expect(error).toContain(
			"Branch shared-import-scanner-test-helpers (PR #2289, merged); trunk master.",
		);
		expect(error).toContain(
			"Fix: ensure master contains the merged PR's commits, or reparent shared-import-scanner-test-helpers onto a trunk that already contains them, then rerun `sdl flow submit`.",
		);
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("failed with exit code 1");
		expect(formattedExecCalls(run.context)).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("phase: submit preflight");
	});

	test("unknown dry-run failure uses model-primary message and writes a raw log", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			env: {
				SDL_SUBMIT_FAILURE_LOG_DIR: logRoot,
				SDL_SUBMIT_FAILURE_MODEL: "openai-codex/submit-summary",
			},
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout: "full stdout details\nsecond line\n",
							stderr: "mystery graphite failure\n",
						},
					},
				],
				textGeneration: [
					{
						ok: true,
						text: "Graphite failed during dry-run.\nNext step: Inspect the raw log and rerun the dry-run command.",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Graphite failed during dry-run.");
		expect(error).toContain("Next step: Inspect the raw log");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("## Submit failed");
		expect(error).not.toContain("## What happened");
		expect(error).not.toContain("```");
		expect(error).not.toContain("----- stdout -----");
		expect(error).not.toContain("mystery graphite failure");

		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("full stdout details\nsecond line");
		expect(await readFile(rawPath ?? "", "utf8")).toContain("mystery graphite failure");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(run.context.textGeneratorCalls[0]?.modelRef).toBe("openai-codex/submit-summary");
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"Truncation: transcript was not truncated.",
		);
		expect(run.context.textGeneratorCalls[0]?.prompt).not.toContain("Raw log path:");
	});

	test("unknown dry-run failure falls back to original stderr when model generation fails", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stdout: "raw stdout\n", stderr: "raw stderr\n" },
					},
				],
				textGeneration: [{ ok: false, error: "model unavailable" }],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("raw stderr");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain(
			"sdl flow submit failed, and the failure could not be interpreted automatically.",
		);
		expect(error).not.toContain("model unavailable");
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("raw stderr");
	});

	test("default restack does not prompt before submit", async () => {
		const confirmations: Array<{ title: string; message: string }> = [];
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack is required before submit\n" },
					},
					{ match: "gt restack --downstack --no-interactive", result: { stdout: "restacked\n" } },
					...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
				],
				confirm: (title, message) => {
					confirmations.push({ title, message });
					return true;
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(confirmations).toEqual([]);
		expect(formattedExecCalls(run.context)).toContain("gt restack --downstack --no-interactive");
	});

	test("--no-restack preserves guided failure without running restack", async () => {
		const run = runWithFakes({
			request: { restack: false },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "must be restacked before submit\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			"Graphite needs a restack before submitting, but automatic restack was disabled or unavailable. Nothing was submitted.",
		);
		expect(run.stderr.join("")).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt restack --downstack --no-interactive",
		);
	});

	test("restack conflicts are reported before submit", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack required before submit\n" },
					},
					{
						match: "gt restack --downstack --no-interactive",
						result: { code: 1, stderr: "CONFLICT (content): src/app.ts\n" },
					},
					{ match: "git diff --name-only --diff-filter=U", result: { stdout: "src/app.ts\n" } },
					{ match: "git status --porcelain", result: { stdout: "UU src/app.ts\n" } },
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			"`gt restack --downstack` hit merge conflicts, so nothing was submitted.",
		);
		expect(run.stderr.join("")).toContain("- src/app.ts");
		expect(run.stderr.join("")).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		expect(
			formattedExecCalls(run.context).filter(
				(call) =>
					call ===
					"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
			),
		).toEqual([]);
	});

	test("readiness recheck failure is deterministic and skips model summarization", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack required before submit\n" },
					},
					{ match: "gt restack --downstack --no-interactive", result: { stdout: "restacked\n" } },
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout:
								"Running submit in 'dry-run' mode.\nValidating that this Graphite stack is ready to submit...\n",
							stderr:
								"WARNING: You must restack before submitting this stack.\nERROR: Aborting dry run.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"Graphite still needs a restack after `sdl flow submit` already ran `gt restack --downstack --no-interactive`. Nothing was submitted.",
		);
		expect(error).toContain("Fix: run `gt restack --downstack` manually");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("WARNING: You must restack before submitting this stack.");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"WARNING: You must restack before submitting this stack.",
		);
	});

	test("empty-branch dry-run warning stops during preflight before metadata or submit", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							stdout: `Running submit in 'dry-run' mode.

🥞 Validating that this Graphite stack is ready to submit...

▸ code-smell/tools-vibechk-exec-artifact-bounds
`,
							stderr: `WARNING: This branch does not introduce any changes:
WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
`,
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"Branch code-smell/tools-vibechk-exec-artifact-bounds is empty, so Graphite will not submit it (GitHub rejects empty PRs). Nothing was submitted.",
		);
		expect(error).toContain("gt delete code-smell/tools-vibechk-exec-artifact-bounds -f -q");
		expect(error).toContain("Raw log:");
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt log --stack --reverse --no-interactive",
		);
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("phase: preflight");
	});

	test("empty branch dry-run with no-op PRs stops before metadata or submit", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							stdout: `Running submit in 'dry-run' mode.

🥞 Validating that this Graphite stack is ready to submit...
WARNING: This branch does not introduce any changes:
▸ empty-branch-test
WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
WARNING: In order to submit, commit some changes to it or delete it and try again.

📝 Preparing to submit PRs for the following branches...
▸ add-preflight-detect-and-skip-empty-branches (No-op)

🆗 All PRs up to date.
`,
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const result = await run.result;
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(
				result.message.startsWith(
					"Branch empty-branch-test is empty, so Graphite will not submit it (GitHub rejects empty PRs). Nothing was submitted.",
				),
			).toBe(true);
			expect(result.message).toContain("gt delete empty-branch-test -f -q");
			expect(result.message.match(/^Raw log: /gmu)).toHaveLength(1);
		}
		const error = run.stderr.join("");
		expect(error).toContain(
			"Branch empty-branch-test is empty, so Graphite will not submit it (GitHub rejects empty PRs). Nothing was submitted.",
		);
		expect(error).toContain("gt delete empty-branch-test -f -q");
		expect(error).toContain("Raw log:");
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt log --stack --reverse --no-interactive",
		);
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
	});

	test("empty-branch post-submit failure uses model-primary output and raw log path", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: { stdout: "◯ main\n◉ feature/demo (current)\n" },
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
					{
						match: "gt branch info --no-interactive --branch feature/demo",
						result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: {
							stdout: `Running in non-interactive mode. Inline prompts to fill PR fields will be skipped.

	🥞 Validating that this Graphite stack is ready to submit...
	▸ sdl-extension-api-followup-stack

	📝 Preparing to submit PRs for the following branches...
	▸ add-sdl-extension-api (No-op)
	`,
							stderr: `WARNING: This branch does not introduce any changes:
	WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
	`,
						},
					},
					{
						match: "gt branch info --no-interactive",
						result: {
							stdout:
								"fix-submit-empty-branch-warning\n\nParent: sdl-extension-api-followup/registry-refactor\n",
						},
					},
				],
				textGeneration: [
					{
						ok: true,
						text: "Submit stack contains an empty branch; Graphite will not submit it.\nBranch: sdl-extension-api-followup-stack\nWhat succeeded: Non-empty branches may already have been submitted or updated.\nRecommended remediation: delete the empty branch if it has no remaining work.\nAlternative: Add and commit real changes only if this branch should still have its own PR.",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Submit stack contains an empty branch; Graphite will not submit it.");
		expect(error).toContain("Branch: sdl-extension-api-followup-stack");
		expect(error).toContain("Non-empty branches may already have been submitted or updated.");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("##");
		expect(error).not.toContain("**");
		expect(error).not.toContain("```");
		expect(error).not.toContain("----- AI interpretation (model-generated) -----");
		expect(error).not.toContain("----- stdout -----");
		expect(
			error.indexOf("Recommended remediation: delete the empty branch"),
		).toBeGreaterThanOrEqual(0);
		expect(error.indexOf("Alternative: Add and commit real changes")).toBeGreaterThan(
			error.indexOf("Recommended remediation: delete the empty branch"),
		);
		expect(error.match(/^Raw log: /gmu)).toHaveLength(1);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"because branch sdl-extension-api-followup-stack is empty",
		);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"because branch sdl-extension-api-followup-stack is empty",
		);
	});

	test("description metadata read failure preserves structured diagnostics", async () => {
		vi.useFakeTimers();
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		tempDirs.push(logRoot);
		const ghStderr = "GraphQL: Could not resolve to a PullRequest with the number of 123\n";
		const viewCommand = "gh pr view 123 --json number,url,title,body,headRefName,baseRefName";
		const run = runWithFakes({
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: successfulSubmitResponses().flatMap((response) =>
					response.match === viewCommand
						? [
								{ match: viewCommand, result: { code: 1, stderr: ghStderr } },
								{ match: viewCommand, result: { code: 1, stderr: ghStderr } },
								{ match: viewCommand, result: { code: 1, stderr: ghStderr } },
								{ match: viewCommand, result: { code: 1, stderr: ghStderr } },
							]
						: [response],
				),
			},
		});

		await vi.runAllTimersAsync();
		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("PRs were submitted; description generation failed.");
		expect(error).toContain(`#123 ${PR_URL}`);
		expect(error).toContain("Could not read GitHub PR details.");
		expect(error).toContain(
			"Cause: gh exited 1: GraphQL: Could not resolve to a PullRequest with the number of 123",
		);
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("----- stdout -----");
		expect(error).not.toContain("----- stderr -----");

		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		const rawLog = await readFile(rawPath ?? "", "utf8");
		expect(rawLog).toContain("phase: PR description");
		expect(rawLog).toContain("details:");
		expect(rawLog).toContain("command: gh");
		expect(rawLog).toContain(
			"args: pr view 123 --json number,url,title,body,headRefName,baseRefName",
		);
		expect(rawLog).toContain("exit_code: 1");
		expect(rawLog).toContain(ghStderr.trim());
	});

	test("description edit failure keeps submitted PR links visible", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: { stdout: "◯ main\n◉ feature/demo (current)\n" },
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
					{
						match: "gt branch info --no-interactive --branch feature/demo",
						result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: `Submitted ${PR_URL}\n` },
					},
					{
						match: "gt branch info --no-interactive",
						result: { stdout: `Current PR: ${PR_URL}\n` },
					},
					{
						match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
						result: { stdout: prJson({ body: "" }) },
					},
					{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{
						match: "git patch-id --stable",
						result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
					},
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{
						match: /^gh pr edit 123 --title Generated PR --body-file /,
						result: { code: 1, stderr: "edit denied\n" },
					},
				],
				textGeneration: [{ ok: true, text: "Generated PR\n\nGenerated body" }],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("PRs were submitted; description generation failed.");
		expect(error).toContain(`#123 ${PR_URL}`);
		expect(error).toContain("Could not update PR #123.");
		expect(error).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
	});
});
