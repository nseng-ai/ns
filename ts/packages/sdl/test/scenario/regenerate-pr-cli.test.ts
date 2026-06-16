import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { GENERATED_BODY_MARKER } from "@asdl/core/submit";

import { formattedExecCalls, runCliWithFakes, type ScriptedExecResponse, type TestState } from "./sdl-cli-fakes.ts";

const PR_URL = "https://github.com/acme/repo/pull/123";
const generatedText = `Improve PR descriptions

This regenerates the PR title and body with the asdl-owned prompt.

## Key Changes

- Adds title generation
- Adds guarded body updates`;

function runWithFakes(args: readonly string[], state: TestState = {}, options: { env?: Record<string, string | undefined> } = {}) {
	return runCliWithFakes(
		{ args, state, env: options.env },
		{
			execResponses: successfulRegeneratePrResponses,
			textGenerationResults: () => [{ ok: true, text: generatedText }],
			missingTextGenerationResult: () => ({ ok: true, text: generatedText }),
		},
	);
}

function successfulRegeneratePrResponses(): ScriptedExecResponse[] {
	return [
		{ match: "gh pr view --json number,url,title,body,headRefName,baseRefName", result: { stdout: prJson({ body: `Old body\n${GENERATED_BODY_MARKER}` }) } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n+export const value = true;\n" } },
		{ match: "git patch-id --stable", result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" } },
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
		{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n+export const value = true;\n" } },
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

function commitsJson(): string {
	return JSON.stringify({ commits: [{ messageHeadline: "Add regenerate-pr", messageBody: "Body from commit" }] });
}

describe("sdl regenerate-pr CLI", () => {
	test("help documents regenerate-pr behavior through clinkr", async () => {
		const run = runWithFakes(["regenerate-pr", "--help"], { exec: [] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl regenerate-pr");
		expect(help).toContain("replacing any existing");
		expect(help).toContain("body. The --force flag");
		expect(help).toContain("ASDL_DEV_PR_DESCRIPTION_MODEL");
		expect(help).toContain("ASDL_DEV_PR_DESCRIPTION_PROMPT");
		expect(help).toContain("--force");
		expect(help).toContain("--json-schema");
		expect(help).not.toContain("\n  --format");
		expect(run.context.execCalls).toEqual([]);
	});

	test("json schema is available without touching GitHub", async () => {
		const run = runWithFakes(["regenerate-pr", "--json-schema"], { exec: [] });

		expect(await run.exit).toBe(0);
		const schema = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(schema).toHaveProperty("input_json_schema");
		expect(schema).toHaveProperty("output_json_schema");
		expect(run.context.execCalls).toEqual([]);
	});

	test("raw regenerate-pr rejects clinkr --format", async () => {
		const run = runWithFakes(["regenerate-pr", "--format", "json"], { exec: [] });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown option '--format'");
		expect(run.context.execCalls).toEqual([]);
	});

	test("regenerates the current branch PR with SDL-owned wording", async () => {
		const run = runWithFakes(["regenerate-pr"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Regenerated PR description.");
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
		expect(run.context.modelCalls[0]?.prompt).toContain("## Context");
		expect(run.context.modelCalls[0]?.prompt).toContain("## Diff");
	});

	test("--force remains a compatibility no-op", async () => {
		const run = runWithFakes(["regenerate-pr", "--force"]);

		expect(await run.exit).toBe(0);
		expect(formattedExecCalls(run.context)).toContainEqual(expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /));
	});

	test("reports no current PR clearly", async () => {
		const run = runWithFakes(["regenerate-pr"], {
			exec: [{ match: "gh pr view --json number,url,title,body,headRefName,baseRefName", result: { code: 1, stderr: "no pull requests found for branch\n" } }],
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Could not resolve current branch PR");
		expect(run.context.execCalls).toHaveLength(1);
	});

	test("uses the historical PR description model environment override", async () => {
		const run = runWithFakes(["regenerate-pr"], {}, { env: { ASDL_DEV_PR_DESCRIPTION_MODEL: "openai-codex/custom-mini" } });

		expect(await run.exit).toBe(0);
		expect(run.context.modelCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
	});

	test("reports the historical env prompt path in success output", async () => {
		const promptPath = join(tmpdir(), `sdl-regenerate-pr-prompt-${randomUUID()}.md`);
		await writeFile(promptPath, "custom system prompt", "utf8");
		try {
			const run = runWithFakes(["regenerate-pr"], {}, { env: { ASDL_DEV_PR_DESCRIPTION_PROMPT: promptPath } });

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain(`Prompt: ${promptPath}`);
			expect(run.context.modelCalls[0]?.system).toBe("custom system prompt");
		} finally {
			await rm(promptPath, { force: true });
		}
	});

	test("unreadable prompt env path exits 2", async () => {
		const run = runWithFakes(["regenerate-pr"], {}, { env: { ASDL_DEV_PR_DESCRIPTION_PROMPT: "/path/that/does/not/exist.md" } });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Could not read ASDL_DEV_PR_DESCRIPTION_PROMPT");
	});

	test("unknown options exit 2", async () => {
		const run = runWithFakes(["regenerate-pr", "--bogus"], { exec: [] });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown option '--bogus'");
		expect(run.stderr.join("")).not.toContain("Usage: sdl regenerate-pr");
		expect(run.context.execCalls).toEqual([]);
	});
});
