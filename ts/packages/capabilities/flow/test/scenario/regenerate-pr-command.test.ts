import { readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import {
	DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT,
	formatManagedGeneratedRegion,
	GENERATED_BODY_MARKER,
	hashPrDescriptionPrompt,
} from "../../src/submit/index.ts";

import { runFlowRegeneratePrCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ExecCall, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

const PR_URL = "https://github.com/acme/repo/pull/123";
// The truecolor red swatch used for `error`-intent headlines; a warn refusal must never carry it.
const ERROR_TRUECOLOR = "\x1b[38;2;248;81;73m";
const generatedText = `Improve PR descriptions

This regenerates the PR title and body with the ns-owned prompt.

## Key Changes

- Adds title generation
- Adds guarded body updates`;

function runRegeneratePrWithFakes(
	options: Parameters<typeof runFlowRegeneratePrCommandWithFakes>[0] = {},
) {
	return runFlowRegeneratePrCommandWithFakes({
		...options,
		defaults: {
			execResponses: successfulRegeneratePrResponses,
			textGenerationResults: () => [{ ok: true, text: generatedText }],
			missingTextGenerationResult: () => ({ ok: true, text: generatedText }),
		},
	});
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
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
		successfulGhPrEditResponse(),
	];
}

function successfulGhPrEditResponse(): ScriptedExecResponse {
	return { match: /^gh pr edit 123 --title Improve PR descriptions --body-file /, result: {} };
}

function successfulReadOnlyRegeneratePrResponses(
	options: { body?: string } = {},
): ScriptedExecResponse[] {
	return successfulRegeneratePrResponses()
		.filter((response) => !(response.match instanceof RegExp))
		.map((response) => {
			if (response.match !== "gh pr view --json number,url,title,body,headRefName,baseRefName") {
				return response;
			}
			return {
				...response,
				result: { stdout: prJson({ body: options.body ?? `Old body\n${GENERATED_BODY_MARKER}` }) },
			};
		});
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

function commitsJson(): string {
	return JSON.stringify({
		commits: [{ messageHeadline: "Add regenerate-pr", messageBody: "Body from commit" }],
	});
}

function currentManagedBody(): string {
	return formatManagedGeneratedRegion("Existing generated body", {
		version: "2",
		patchId: "default-patch-id",
		promptHash: hashPrDescriptionPrompt(DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT),
		generator: "ns-pr-description-v2",
	});
}

function bodyInspectingEditResponse(assertBody: (body: string) => void): ScriptedExecResponse {
	return {
		match: (call: ExecCall) => {
			if (
				call.command !== "gh" ||
				call.args.slice(0, 5).join(" ") !== "pr edit 123 --title Improve PR descriptions"
			) {
				return false;
			}
			const bodyFileFlagIndex = call.args.indexOf("--body-file");
			const bodyPath = call.args[bodyFileFlagIndex + 1];
			if (bodyPath === undefined) return false;
			assertBody(readFileSync(bodyPath, "utf8"));
			return true;
		},
		result: {},
	};
}

describe("project-local regenerate-pr extension behavior", () => {
	test("regenerates the current branch PR after confirmation", async () => {
		let confirmCalls = 0;
		const run = runRegeneratePrWithFakes({
			state: {
				confirm: () => {
					confirmCalls += 1;
					return true;
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(confirmCalls).toBe(1);
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Regenerated PR title and description.");
		expect(stdout).toContain(`PR: #123 ${PR_URL}`);
		expect(stdout).toContain("Title: Improve PR descriptions");
		expect(stdout).toContain("Prompt: built-in");
		expect(stdout).toContain("Cwd: /work");
		// Success stays concise: no failure/debug plumbing leaks into the success block.
		expect(stdout).not.toContain("Exit:");
		expect(stdout).not.toContain("stdout:");
		expect(run.stderr.join("")).toBe("");
		expect(run.liveOutput).toEqual([
			{ stream: "stderr", text: "Preparing PR metadata update…\n" },
			{ stream: "stderr", text: "checking PR #123 description fingerprint\n" },
			{
				stream: "stderr",
				text: "recomputing PR #123 description (no generated fingerprint found)\n",
			},
			{ stream: "stderr", text: "generating PR metadata (attempt 1/2)\n" },
			{ stream: "stderr", text: "PR metadata generated (token usage unavailable)\n" },
			{ stream: "stderr", text: "Updating PR #123 metadata on GitHub…\n" },
		]);
		expect(formattedExecCalls(run.context)).toEqual(
			expect.arrayContaining([
				"gh pr view --json number,url,title,body,headRefName,baseRefName",
				"git rev-parse --show-toplevel",
				"gh pr diff 123",
				"git patch-id --stable",
				"gh pr view 123 --json commits",
				expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /),
			]),
		);
		expect(run.context.textGeneratorCalls[0]).toMatchObject({
			operation: "pr-description",
			modelRef: "openai-codex/gpt-5.4-mini",
			maxTokens: 2048,
			reasoning: "low",
		});
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain("## Context");
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain("## Diff");
	});

	test("declined confirmation renders a warn refusal and does not edit GitHub", async () => {
		const run = runRegeneratePrWithFakes({
			state: { confirm: () => false, exec: successfulReadOnlyRegeneratePrResponses() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const rawStderr = run.stderr.join("");
		// A declined guardrail renders warn — its headline must not carry the red error swatch.
		expect(rawStderr.split("\n")[0] ?? "").not.toContain(ERROR_TRUECOLOR);
		const stderr = stripAnsi(rawStderr);
		expect(stderr).toContain("PR metadata regeneration was cancelled; GitHub was not edited.");
		expect(stderr).toContain("Cwd: /work");
		expect(formattedExecCalls(run.context)).not.toContainEqual(
			expect.stringContaining("gh pr edit"),
		);
	});

	test("missing confirmation channel exits 2 and does not edit GitHub", async () => {
		const run = runRegeneratePrWithFakes({
			state: { exec: successfulReadOnlyRegeneratePrResponses() },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		const rawStderr = run.stderr.join("");
		// Missing confirmation is a usage-style guardrail (warn), not a red subprocess failure.
		expect(rawStderr.split("\n")[0] ?? "").not.toContain(ERROR_TRUECOLOR);
		const stderr = stripAnsi(rawStderr);
		expect(stderr).toContain(
			"Confirmation is unavailable; pass --force to edit GitHub non-interactively.",
		);
		expect(formattedExecCalls(run.context)).not.toContainEqual(
			expect.stringContaining("gh pr edit"),
		);
	});

	test("already-current managed region succeeds without confirming, generating, or editing", async () => {
		let confirmCalls = 0;
		const currentBody = currentManagedBody();
		const run = runRegeneratePrWithFakes({
			state: {
				confirm: () => {
					confirmCalls += 1;
					return true;
				},
				exec: successfulReadOnlyRegeneratePrResponses({ body: currentBody }),
			},
		});

		expect(await run.exit).toBe(0);
		expect(confirmCalls).toBe(0);
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("PR title and description are already current.");
		expect(stdout).toContain(`PR: #123 ${PR_URL}`);
		expect(run.stderr.join("")).toBe("");
		expect(run.context.textGeneratorCalls).toEqual([]);
		const calls = formattedExecCalls(run.context);
		expect(calls).not.toContain("gh pr view 123 --json commits");
		expect(calls).not.toContainEqual(expect.stringContaining("gh pr edit"));
	});

	test("--force regenerates a current managed region without prompting", async () => {
		let confirmCalls = 0;
		const run = runRegeneratePrWithFakes({
			request: { force: true },
			state: {
				confirm: () => {
					confirmCalls += 1;
					return false;
				},
				exec: [
					...successfulReadOnlyRegeneratePrResponses({ body: currentManagedBody() }),
					successfulGhPrEditResponse(),
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(confirmCalls).toBe(0);
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(formattedExecCalls(run.context)).toContainEqual(
			expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /),
		);
	});

	test("preserves human body text outside the managed generated region", async () => {
		const oldRegion = formatManagedGeneratedRegion("Old generated body", {
			version: "2",
			patchId: "old-patch",
			promptHash: "sha256:old-prompt",
			generator: "ns-pr-description-v2",
		});
		const existingBody = `Human intro\n\n${oldRegion}\n\nHuman footer`;
		const run = runRegeneratePrWithFakes({
			state: {
				confirm: () => true,
				exec: [
					...successfulReadOnlyRegeneratePrResponses({ body: existingBody }),
					bodyInspectingEditResponse((body) => {
						expect(body).toContain("Human intro");
						expect(body).toContain("Human footer");
						expect(body).toContain("This regenerates the PR title and body");
						expect(body).not.toContain("Old generated body");
					}),
				],
			},
		});

		expect(await run.exit).toBe(0);
	});

	test("reports no current PR clearly", async () => {
		const run = runRegeneratePrWithFakes({
			state: {
				confirm: () => true,
				exec: [
					{
						match: "gh pr view --json number,url,title,body,headRefName,baseRefName",
						result: { code: 1, stderr: "no pull requests found for branch\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const stderr = stripAnsi(run.stderr.join(""));
		// The domain summary becomes the failure headline; the cause line stays visible in the body.
		expect(stderr).toContain("Could not resolve current branch PR.");
		expect(stderr).toContain("Could not read GitHub PR details.");
		expect(stderr).toContain("Cwd: /work");
		expect(run.context.execCalls).toHaveLength(1);
	});

	test("uses the historical PR description model environment override", async () => {
		const run = runRegeneratePrWithFakes({
			state: { confirm: () => true },
			env: { NS_DEV_PR_DESCRIPTION_MODEL: "openai-codex/custom-mini" },
		});

		expect(await run.exit).toBe(0);
		expect(run.context.textGeneratorCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
	});

	test("ignores env prompt overrides when no repo point catalog is available", async () => {
		const promptPath = join(tmpdir(), `ns-regenerate-pr-prompt-${Date.now()}.md`);
		await writeFile(promptPath, "custom system prompt", "utf8");
		try {
			const run = runRegeneratePrWithFakes({
				state: { confirm: () => true },
				env: { NS_DEV_PR_DESCRIPTION_PROMPT: promptPath },
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("Prompt: built-in");
			expect(run.context.textGeneratorCalls[0]?.system).toBe(DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT);
		} finally {
			await rm(promptPath, { force: true });
		}
	});

	test("unreadable prompt env path is ignored when no repo point catalog is available", async () => {
		const run = runRegeneratePrWithFakes({
			state: { confirm: () => true },
			env: { NS_DEV_PR_DESCRIPTION_PROMPT: "/path/that/does/not/exist.md" },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Prompt: built-in");
		expect(run.stderr.join("")).not.toContain("Could not read NS_DEV_PR_DESCRIPTION_PROMPT");
	});
});
