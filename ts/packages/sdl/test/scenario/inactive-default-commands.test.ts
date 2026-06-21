import { describe, expect, test } from "vitest";

import { GENERATED_BODY_MARKER } from "@sdl/core/submit";

import { executeSdlCommand } from "../../src/command-registry.ts";
import { defaultCpCommand } from "../../src/default-commands/cp.ts";
import { defaultRegeneratePrCommand } from "../../src/default-commands/regenerate-pr.ts";
import { defaultSubmitCommand } from "../../src/default-commands/submit.ts";
import {
	formattedExecCalls,
	ScriptedSdlTestContext,
	type ScriptedExecResponse,
	type ScriptedTextGenerationResult,
} from "./sdl-cli-fakes.ts";

const PR_URL = "https://github.com/acme/repo/pull/123";
const generatedPrText = `Improve PR descriptions

This regenerates the PR title and body with the sdl-owned prompt.

## Key Changes

- Adds title generation
- Adds guarded body updates`;

interface InactiveCommandRun {
	context: ScriptedSdlTestContext;
	stdout: string[];
	stderr: string[];
	liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }>;
}

function createInactiveCommandRun(options: {
	exec: readonly ScriptedExecResponse[];
	textGeneration?: readonly ScriptedTextGenerationResult[] | undefined;
	env?: Record<string, string | undefined> | undefined;
}): InactiveCommandRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
	const context = new ScriptedSdlTestContext(
		{
			exec: options.exec,
			textGeneration: options.textGeneration ?? [{ ok: true, text: generatedPrText }],
		},
		{
			env: { HOME: "/work/.home", ...(options.env ?? {}) },
			execResponses: () => [],
			textGenerationResults: () => [],
			missingTextGenerationResult: () => ({ ok: true, text: generatedPrText }),
		},
	);
	context.stdout = (text) => stdout.push(text);
	context.stderr = (text) => stderr.push(text);
	context.onOutput = (stream, text) => liveOutput.push({ stream, text });
	return { context, stdout, stderr, liveOutput };
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
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint tests\n" } },
	];
}

function cleanCheckpointResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
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
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson("Add submit") } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
		{
			match: "git patch-id --stable",
			result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
		},
		{ match: /^gh pr edit 123 --title Improve PR descriptions --body-file /, result: {} },
	];
}

function successfulRegeneratePrResponses(): ScriptedExecResponse[] {
	return [
		{
			match: "gh pr view --json number,url,title,body,headRefName,baseRefName",
			result: { stdout: prJson({ body: `Old body\n${GENERATED_BODY_MARKER}` }) },
		},
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{
			match: "gh pr diff 123",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n+export const value = true;\n" },
		},
		{
			match: "git patch-id --stable",
			result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
		},
		{
			match: "gh pr view 123 --json commits",
			result: { stdout: commitsJson("Add regenerate-pr") },
		},
		{ match: /^gh pr edit 123 --title Improve PR descriptions --body-file /, result: {} },
	];
}

function prJson(options: { body: string; title?: string } = { body: "" }): string {
	return JSON.stringify({
		number: 123,
		url: PR_URL,
		title: options.title ?? "Existing PR title",
		body: options.body,
		headRefName: "feature/demo",
		baseRefName: "main",
	});
}

function commitsJson(headline: string): string {
	return JSON.stringify({
		commits: [{ messageHeadline: headline, messageBody: "Body from commit" }],
	});
}

describe("inactive default SDL command modules", () => {
	test("cp default command still creates checkpoint commits when invoked directly", async () => {
		const run = createInactiveCommandRun({
			exec: dirtyCheckpointResponses(),
			textGeneration: [
				{
					ok: true,
					text: `[cp] Update checkpoint tests

- Add inactive command coverage`,
				},
			],
		});

		const result = await executeSdlCommand(run.context, defaultCpCommand, {});

		expect(result).toEqual({
			ok: true,
			message: `abc123 [cp] Update checkpoint tests
[cp] Update checkpoint tests

- Add inactive command coverage`,
		});
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
		]);
		expect(run.context.modelCalls[0]).toMatchObject({
			operation: "checkpoint-message",
			modelRef: "openai-codex/gpt-5.4-mini",
		});
	});

	test("submit default command still submits and updates PR metadata when invoked directly", async () => {
		const run = createInactiveCommandRun({ exec: successfulSubmitResponses() });

		const result = await executeSdlCommand(run.context, defaultSubmitCommand, {});

		expect(result).toEqual({ ok: true, message: "" });
		expect(run.stdout.join("")).toContain("Submitted 1 PR:");
		expect(run.stdout.join("")).toContain(`✓ #123 ${PR_URL}`);
		expect(run.stdout.join("")).toContain("description updated");
		expect(run.stderr.join("")).toBe("");
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				{ stream: "stderr", text: "sdl submit\n" },
				{ stream: "stderr", text: "✓ Checkpoint phase complete\n" },
				{ stream: "stderr", text: "• Submit: running gt submit…\n" },
			]),
		);
		expect(formattedExecCalls(run.context)).toContainEqual(
			expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /),
		);
		expect(run.context.modelCalls[0]).toMatchObject({
			operation: "pr-description",
			modelRef: "openai-codex/gpt-5.4-mini",
		});
	});

	test("regenerate-pr default command still updates PR metadata when invoked directly", async () => {
		const run = createInactiveCommandRun({ exec: successfulRegeneratePrResponses() });

		const result = await executeSdlCommand(run.context, defaultRegeneratePrCommand, {});

		expect(result).toEqual({ ok: true, message: "" });
		expect(run.stdout.join("")).toContain("Regenerated PR title and description.");
		expect(run.stdout.join("")).toContain(`PR: #123 ${PR_URL}`);
		expect(run.stdout.join("")).toContain("Prompt: built-in");
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual(
			expect.arrayContaining([
				"gh pr view --json number,url,title,body,headRefName,baseRefName",
				"gh pr view 123 --json commits",
				"git rev-parse --show-toplevel",
				"gh pr diff 123",
				expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /),
			]),
		);
		expect(run.context.modelCalls[0]).toMatchObject({
			operation: "pr-description",
			modelRef: "openai-codex/gpt-5.4-mini",
			maxTokens: 2048,
			reasoning: "low",
		});
	});
});
