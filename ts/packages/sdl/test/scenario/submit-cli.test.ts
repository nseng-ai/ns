import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
	DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT,
	PR_DESCRIPTION_GENERATOR_VERSION,
	formatManagedGeneratedRegion,
	hashPrDescriptionPrompt,
} from "@asdl/core/submit";
import { runCli } from "@asdl/sdl/cli";
import type { TextGenerationResult } from "@asdl/sdl/sdk";

import {
	formattedExecCalls,
	runCliWithFakes,
	ScriptedSdlTestContext,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
	type TestState,
} from "./sdl-cli-fakes.ts";

const PR_URL = "https://github.com/acme/repo/pull/123";
const GRAPHITE_PR_URL = "https://app.graphite.com/github/pr/acme/repo/123";
const LAGGING_VERIFICATION_PR_URL = "https://app.graphite.com/github/pr/dagster-io/asdl-tools/1517";

function createSubmitContext(state: TestState = {}): ScriptedSdlTestContext {
	return new ScriptedSdlTestContext(state, {
		execResponses: successfulSubmitResponses,
		textGenerationResults: () => [{ ok: true, text: defaultPrDescriptionText() }],
		missingTextGenerationResult: () => ({ ok: true, text: defaultPrDescriptionText() }),
	});
}

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: successfulSubmitResponses,
		textGenerationResults: () => [{ ok: true, text: defaultPrDescriptionText() }],
		missingTextGenerationResult: () => ({ ok: true, text: defaultPrDescriptionText() }),
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

function successfulSubmitResponses(): ScriptedExecResponse[] {
	return [
		...cleanCheckpointResponses(),
		{
			match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
			match: "gt submit -nps --no-ai --no-interactive --no-view --no-web",
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

describe("sdl submit CLI", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test("help and schema expose built-in submit without running subprocesses", async () => {
		const helpRun = runWithFakes({ args: ["submit", "--help"], state: { exec: [] } });
		expect(await helpRun.exit).toBe(0);
		const help = helpRun.stdout.join("");
		expect(help).toContain("Usage: sdl submit");
		expect(help).toContain("--restack");
		expect(help).toContain("--verbose");
		expect(help).toContain("ASDL_DEV_PR_DESCRIPTION_MODEL");
		expect(help).toContain("ASDL_DEV_PR_DESCRIPTION_PROMPT");
		expect(help).toContain("SDL_SUBMIT_FAILURE_LOG_DIR");
		expect(help).not.toContain("\n  --format");
		expect(helpRun.context.execCalls).toEqual([]);

		const schemaRun = runWithFakes({ args: ["submit", "--json-schema"], state: { exec: [] } });
		expect(await schemaRun.exit).toBe(0);
		expect(JSON.parse(schemaRun.stdout.join(""))).toHaveProperty("input_json_schema");
		expect(schemaRun.context.execCalls).toEqual([]);
	});

	test("clean success submits, verifies current PR, prints quiet progress, and rewrites PR bodies", async () => {
		const run = runWithFakes({ args: ["submit"] });

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Submitted 1 PR:");
		expect(output).toContain(`✓ #123 ${PR_URL}`);
		expect(output).toContain("description updated");
		expect(output).not.toContain("gt submit succeeded");
		expect(output).not.toContain("PRs:");
		expect(output).not.toContain("Updated PR descriptions after submit");
		expect(run.stderr.join("")).toBe("");
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				{ stream: "stderr", text: "sdl submit\n" },
				{
					stream: "stderr",
					text: "• Checking worktree and checkpointing pending changes if needed…\n",
				},
				{ stream: "stderr", text: "✓ Checkpoint phase complete\n" },
				{ stream: "stderr", text: "• Preflight: checking Graphite submit readiness…\n" },
				{ stream: "stderr", text: "• Metadata: preparing PR metadata before submit…\n" },
				{ stream: "stderr", text: "• Submit: running gt submit…\n" },
				{ stream: "stderr", text: "• Verification: checking submitted PR…\n" },
				{ stream: "stderr", text: "• Descriptions: generating or validating PR descriptions…\n" },
				{ stream: "stderr", text: "  … preparing descriptions for 1 PR\n" },
				{ stream: "stderr", text: "  … loading PR #123 metadata (1/1)\n" },
				{ stream: "stderr", text: "  … resolving PR description prompt and model\n" },
				{ stream: "stderr", text: "  … checking PR #123 description fingerprint\n" },
				{ stream: "stderr", text: "  … generating PR metadata (attempt 1/2)\n" },
				{ stream: "stderr", text: "  … updating PR #123 description\n" },
				{ stream: "stderr", text: "  … finished PR #123 description\n" },
			]),
		);
		expect(run.liveOutput).not.toContainEqual({ stream: "stdout", text: "ready\n" });
		expect(run.liveOutput).not.toContainEqual({ stream: "stdout", text: `Submitted ${PR_URL}\n` });
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
		const run = runWithFakes({ args: ["submit", "--verbose"] });

		expect(await run.exit).toBe(0);
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				{ stream: "stderr", text: "• Preflight: checking Graphite submit readiness…\n" },
				{ stream: "stdout", text: "ready\n" },
				{ stream: "stderr", text: "• Submit: running gt submit…\n" },
				{ stream: "stdout", text: `Submitted ${PR_URL}\n` },
			]),
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
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web",
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
		expect(run.context.modelCalls).toEqual([]);
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
		const run = runWithFakes({ args: ["submit"], state: { textGeneration: [pendingModel] } });

		await vi.waitFor(() => {
			expect(run.context.modelCalls).toHaveLength(1);
		});
		expect(run.liveOutput).toContainEqual({
			stream: "stderr",
			text: "  … generating PR metadata (attempt 1/2)\n",
		});

		await vi.advanceTimersByTimeAsync(5_000);
		expect(run.liveOutput).toContainEqual({
			stream: "stderr",
			text: "  … still generating PR metadata (5s elapsed)\n",
		});

		await vi.advanceTimersByTimeAsync(5_000);
		expect(run.liveOutput).toContainEqual({
			stream: "stderr",
			text: "  … still generating PR metadata (10s elapsed)\n",
		});

		resolveModel?.({ ok: true, text: defaultPrDescriptionText() });
		expect(await run.exit).toBe(0);
	});

	test("pre-submit metadata preparation reports progress across large stacks", async () => {
		const run = runWithFakes({
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gt log --stack --reverse --no-interactive",
						result: { stdout: "◯ main\n◯ feature/base\n◉ feature/top (current)\n" },
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
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web",
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
				{ stream: "stderr", text: "  … inspecting Graphite stack before metadata preparation\n" },
				{
					stream: "stderr",
					text: "  … inspecting Graphite stack branch metadata for 2 branches\n",
				},
				{ stream: "stderr", text: "  … inspecting PR metadata for feature/base (1/2)\n" },
				{ stream: "stderr", text: "  … inspecting PR metadata for feature/top (2/2)\n" },
				{ stream: "stderr", text: "  … reading local commits and diff for feature/top\n" },
				{
					stream: "stderr",
					text: "  … found 2 stack branches; 1 new single-commit branch needs initial PR metadata\n",
				},
				{ stream: "stderr", text: "  … generating initial PR metadata for feature/top (1/1)\n" },
				{ stream: "stderr", text: "  … checking clean worktree before metadata amendment\n" },
				{ stream: "stderr", text: "  … amending local PR metadata commit for feature/top (1/1)\n" },
				{ stream: "stderr", text: "  … prepared pre-submit PR metadata for 1 branch\n" },
			]),
		);
	});

	test("direct CLI output gets live submit progress without an injected live-output hook", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const context = createSubmitContext();

		expect(
			await runCli(["submit"], {
				context,
				stdout: (text) => {
					stdout.push(text);
				},
				stderr: (text) => {
					stderr.push(text);
				},
			}),
		).toBe(0);

		expect(stderr.join("")).toContain("sdl submit\n");
		expect(stderr.join("")).toContain(
			"• Checking worktree and checkpointing pending changes if needed…",
		);
		expect(stderr.join("")).toContain("• Submit: running gt submit…");
		expect(stdout.join("")).not.toContain("ready\n");
		expect(stdout.join("")).not.toContain(`Submitted ${PR_URL}\n`);
		expect(stdout.join("")).toContain("Submitted 1 PR:");
	});

	test("accepts submit-output PR links when current PR verification lags", async () => {
		const run = runWithFakes({
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web",
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
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web",
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
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web",
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
			"`sdl submit` checkpoints outstanding worktree changes before submitting.",
		);
		expect(error).toContain("Raw log:");
		expect(run.context.modelCalls).toHaveLength(1);
	});

	test("dirty worktree checkpoints before submitting", async () => {
		const run = runWithFakes({
			args: ["submit"],
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
				"gt submit -nps --no-ai --no-interactive --no-view --no-web",
			]),
		);
	});

	test("checkpoint failure aborts before Graphite submit", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			args: ["submit"],
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
			"sdl submit failed, and the failure could not be interpreted automatically.",
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

	test("restack-required dry-run stops with guidance when no flag or confirmation is available", async () => {
		const run = runWithFakes({
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "branch must be restacked before submitting\n" },
					},
				],
				textGeneration: [{ ok: false, error: "summary unavailable" }],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Graphite requires a restack before submission.");
		expect(run.stderr.join("")).toContain("Raw log:");
		expect(run.context.modelCalls).toHaveLength(1);
		expect(formattedExecCalls(run.context)).not.toContain("gt restack --no-interactive");
	});

	test("trunk-out-of-date dry-run failure is deterministic and uses model summarization", async () => {
		const run = runWithFakes({
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout: "Running submit in 'dry-run' mode...\n",
							stderr:
								"ERROR: Aborting submit because trunk branch is out of date and could not be updated.\n",
						},
					},
				],
				textGeneration: [
					{
						ok: true,
						text: "Graphite could not update trunk before submit.\nNext step: Update or repair the local Graphite trunk checkout.",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Graphite could not update trunk before submit.");
		expect(error).toContain("Next step: Update or repair the local Graphite trunk checkout.");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("----- AI interpretation (model-generated) -----");
		expect(error).not.toContain("----- stdout -----");
		expect(error).not.toContain("ERROR: Aborting submit because trunk branch is out of date");
		expect(run.context.modelCalls).toHaveLength(1);
	});

	test("unknown dry-run failure uses model-primary message and writes a raw log", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			args: ["submit"],
			env: {
				SDL_SUBMIT_FAILURE_LOG_DIR: logRoot,
				SDL_SUBMIT_FAILURE_MODEL: "openai-codex/submit-summary",
			},
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
		expect(run.context.modelCalls).toHaveLength(1);
		expect(run.context.modelCalls[0]?.modelRef).toBe("openai-codex/submit-summary");
		expect(run.context.modelCalls[0]?.prompt).toContain(
			"Truncation: transcript was not truncated.",
		);
		expect(run.context.modelCalls[0]?.prompt).not.toContain("Raw log path:");
	});

	test("unknown dry-run failure falls back to original stderr when model generation fails", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			args: ["submit"],
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
			"sdl submit failed, and the failure could not be interpreted automatically.",
		);
		expect(error).not.toContain("model unavailable");
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("raw stderr");
	});

	test("confirmation threads through SdlContext and runs restack before submit", async () => {
		const confirmations: Array<{ title: string; message: string }> = [];
		const run = runWithFakes({
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack is required before submit\n" },
					},
					{ match: "gt restack --no-interactive", result: { stdout: "restacked\n" } },
					...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
				],
				confirm: (title, message) => {
					confirmations.push({ title, message });
					return true;
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(confirmations[0]?.title).toBe("Run gt restack before submit?");
		expect(confirmations[0]?.message).toContain("gt restack --no-interactive");
		expect(formattedExecCalls(run.context)).toContain("gt restack --no-interactive");
	});

	test("runCli preserves hooks already present on an injected SdlContext", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
		const confirmations: string[] = [];
		const context = createSubmitContext({
			exec: [
				...cleanCheckpointResponses(),
				{
					match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
					result: { code: 1, stdout: "restack required before submit\n" },
				},
				{ match: "gt restack --no-interactive", result: { stdout: "restacked\n" } },
				...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
			],
			confirm: (title) => {
				confirmations.push(title);
				return true;
			},
		});
		context.stdout = (text) => {
			stdout.push(text);
		};
		context.stderr = (text) => {
			stderr.push(text);
		};
		context.onOutput = (stream, text) => {
			liveOutput.push({ stream, text });
		};

		expect(await runCli(["submit"], { context, homeDir: join(context.cwd, ".home") })).toBe(0);
		expect(stdout.join("")).toContain("Submitted 1 PR:");
		expect(stderr.join("")).toBe("");
		expect(confirmations).toEqual(["Run gt restack before submit?"]);
		expect(liveOutput).toEqual(
			expect.arrayContaining([{ stream: "stderr", text: "• Preflight: running gt restack…\n" }]),
		);
		expect(liveOutput).not.toContainEqual({ stream: "stdout", text: "restacked\n" });
	});

	test("--restack runs restack without prompting", async () => {
		const run = runWithFakes({
			args: ["submit", "--restack"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "must be restacked before submit\n" },
					},
					{ match: "gt restack --no-interactive", result: { stdout: "restacked\n" } },
					...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
				],
				confirm: () => {
					throw new Error("confirm should not be called with --restack");
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(formattedExecCalls(run.context)).toContain("gt restack --no-interactive");
	});

	test("restack conflicts are reported before submit", async () => {
		const run = runWithFakes({
			args: ["submit", "--restack"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack required before submit\n" },
					},
					{
						match: "gt restack --no-interactive",
						result: { code: 1, stderr: "CONFLICT (content): src/app.ts\n" },
					},
					{ match: "git diff --name-only --diff-filter=U", result: { stdout: "src/app.ts\n" } },
					{ match: "git status --porcelain", result: { stdout: "UU src/app.ts\n" } },
				],
				textGeneration: [{ ok: false, error: "summary unavailable" }],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			"`gt restack` hit merge conflicts. Submission was not attempted.",
		);
		expect(run.stderr.join("")).toContain("- src/app.ts");
		expect(run.stderr.join("")).toContain("Raw log:");
		expect(run.context.modelCalls).toHaveLength(1);
		expect(
			formattedExecCalls(run.context).filter(
				(call) => call === "gt submit -nps --no-ai --no-interactive --no-view --no-web",
			),
		).toEqual([]);
	});

	test("readiness recheck failure is deterministic and uses model summarization", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			args: ["submit", "--restack"],
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack required before submit\n" },
					},
					{ match: "gt restack --no-interactive", result: { stdout: "restacked\n" } },
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout:
								"Running submit in 'dry-run' mode.\nValidating that this Graphite stack is ready to submit...\n",
							stderr:
								"WARNING: You must restack before submitting this stack.\nERROR: Aborting dry run.\n",
						},
					},
				],
				textGeneration: [
					{
						ok: true,
						text: "Graphite still requires restack after sdl already ran gt restack.\nNext step: Verify readiness with the dry-run command from the raw log.",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Graphite still requires restack after sdl already ran gt restack.");
		expect(error).toContain("Next step: Verify readiness with the dry-run command");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("----- AI interpretation (model-generated) -----");
		expect(error).not.toContain("Graphite dry-run error:");
		expect(error).not.toContain("WARNING: You must restack before submitting this stack.");
		expect(run.context.modelCalls).toHaveLength(1);
		expect(run.context.modelCalls[0]?.prompt).toContain(
			"Graphite still requires restack after `sdl submit` already ran `gt restack --no-interactive`.",
		);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("Graphite dry-run error:");
	});

	test("empty-branch post-submit failure uses model-primary output and raw log path", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "sdl-submit-test-"));
		const run = runWithFakes({
			args: ["submit"],
			env: { SDL_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web",
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
						text: "Current branch is empty; Graphite skipped it.\nBranch: sdl-extension-api-followup-stack\nWhat succeeded: Non-empty branches may already have been submitted or updated.\nNext step: Remove, delete, or reparent around the empty branch if it has no remaining work.\nAlternative: Add and commit real changes only if this branch should still have its own PR.",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Current branch is empty; Graphite skipped it.");
		expect(error).toContain("Branch: sdl-extension-api-followup-stack");
		expect(error).toContain("Non-empty branches may already have been submitted or updated.");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("##");
		expect(error).not.toContain("**");
		expect(error).not.toContain("```");
		expect(error).not.toContain("----- AI interpretation (model-generated) -----");
		expect(error).not.toContain("----- stdout -----");
		expect(error.indexOf("Next step: Remove, delete, or reparent")).toBeGreaterThanOrEqual(0);
		expect(error.indexOf("Alternative: Add and commit real changes")).toBeGreaterThan(
			error.indexOf("Next step: Remove, delete, or reparent"),
		);
		expect(error.match(/^Raw log: /gmu)).toHaveLength(1);
		expect(run.context.modelCalls[0]?.prompt).toContain(
			"because branch sdl-extension-api-followup-stack is empty",
		);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"because branch sdl-extension-api-followup-stack is empty",
		);
	});

	test("description edit failure keeps submitted PR links visible", async () => {
		const run = runWithFakes({
			args: ["submit"],
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
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
						match: "gt submit -nps --no-ai --no-interactive --no-view --no-web",
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
				textGeneration: [
					{ ok: true, text: "Generated PR\n\nGenerated body" },
					{ ok: false, error: "summary unavailable" },
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("PRs were submitted; description generation failed.");
		expect(error).toContain(`#123 ${PR_URL}`);
		expect(error).toContain("Could not update PR #123.");
		expect(error).toContain("Raw log:");
		expect(run.context.modelCalls).toHaveLength(2);
	});
});
