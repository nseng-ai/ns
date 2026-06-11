import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCli } from "asdl-dev/src/cli.ts";
import { GENERATED_BODY_MARKER } from "asdl-dev/src/pr-description.ts";
import { inMemoryContext, type InMemoryContextState } from "../support/in-memory-gateways.ts";

function runWithFakes(args: readonly string[], state: InMemoryContextState = {}, options: { env?: Record<string, string | undefined> } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const fakes = inMemoryContext(state);
	return {
		...fakes,
		stdout,
		stderr,
		exit: runCli(args, {
			context: fakes.context,
			cwd: "/work",
			env: options.env ?? {},
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
		}),
	};
}

const generatedText = `Improve PR descriptions

This regenerates the PR title and body with the asdl-owned prompt.

## Key Changes

- Adds title generation
- Adds guarded body updates`;

describe("asdl-dev pr-regen", () => {
	test("regenerates a marker-bearing current branch PR", async () => {
		const run = runWithFakes(["pr-regen"], {
			githubPr: {
				currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Old title", body: `Old body\n${GENERATED_BODY_MARKER}`, headRefName: "feature/demo", baseRefName: "main" },
			},
			textGeneration: { results: [{ ok: true, text: generatedText }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Regenerated PR description.");
		expect(run.stdout.join("")).toContain("Prompt: built-in");
		expect(run.githubPr.editPrCalls).toEqual([
			expect.objectContaining({
				cwd: "/work",
				number: 123,
				title: "Improve PR descriptions",
			}),
		]);
		expect(run.githubPr.editPrCalls[0]?.body).toContain(GENERATED_BODY_MARKER);
		expect(run.textGeneration.generateTextCalls[0]).toMatchObject({
			operation: "pr-description",
			modelRef: "openai-codex/gpt-5.4-mini",
			maxTokens: 2048,
			reasoning: "low",
		});
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## Context");
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## Diff");
	});

	test("allows empty PR bodies without --force", async () => {
		const run = runWithFakes(["pr-regen"], {
			githubPr: { currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Old", body: "", headRefName: "feature/demo", baseRefName: "main" } },
			textGeneration: { results: [{ ok: true, text: generatedText }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.githubPr.editPrCalls).toHaveLength(1);
	});

	test("regenerates a gt-prefilled body without --force", async () => {
		const run = runWithFakes(["pr-regen"], {
			githubPr: {
				currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Add widget", body: "Implements the widget flow.", headRefName: "feature/demo", baseRefName: "main" },
				commitMessages: { 123: [{ headline: "Add widget", body: "Implements the widget flow.\n" }] },
			},
			textGeneration: { results: [{ ok: true, text: generatedText }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.githubPr.editPrCalls).toHaveLength(1);
	});

	test("reports a commit-fetch failure instead of refusing silently", async () => {
		const run = runWithFakes(["pr-regen"], {
			githubPr: {
				currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Old", body: "Manual body", headRefName: "feature/demo", baseRefName: "main" },
				commitMessages: { 123: { error: { code: "github_pr_commits_failed", message: "commit messages unavailable" } } },
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("commit messages unavailable");
		expect(run.githubPr.editPrCalls).toEqual([]);
	});

	test("refuses to overwrite a manual PR body without --force", async () => {
		const run = runWithFakes(["pr-regen"], {
			githubPr: { currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Old", body: "Manual body", headRefName: "feature/demo", baseRefName: "main" } },
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("generated-body marker");
		expect(run.stderr.join("")).toContain("--force");
		expect(run.githubPr.editPrCalls).toEqual([]);
	});

	test("--force overwrites a manual PR body", async () => {
		const run = runWithFakes(["pr-regen", "--force"], {
			githubPr: { currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Old", body: "Manual body", headRefName: "feature/demo", baseRefName: "main" } },
			textGeneration: { results: [{ ok: true, text: generatedText }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.githubPr.editPrCalls).toHaveLength(1);
	});

	test("reports no current PR clearly", async () => {
		const run = runWithFakes(["pr-regen"], {
			githubPr: { currentPr: { error: { code: "github_pr_view_failed", message: "no pull requests found for branch" } } },
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Could not resolve current branch PR");
	});

	test("uses the PR description model environment override", async () => {
		const run = runWithFakes(
			["pr-regen"],
			{
				githubPr: { currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Old", body: "", headRefName: "feature/demo", baseRefName: "main" } },
				textGeneration: { results: [{ ok: true, text: generatedText }] },
			},
			{ env: { ASDL_DEV_PR_DESCRIPTION_MODEL: "openai-codex/custom-mini" } },
		);

		expect(await run.exit).toBe(0);
		expect(run.textGeneration.generateTextCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
	});

	test("reports the env prompt path in success output", async () => {
		const promptPath = join(tmpdir(), `asdl-dev-pr-regen-prompt-${randomUUID()}.md`);
		await writeFile(promptPath, "custom system prompt", "utf8");
		try {
			const run = runWithFakes(
				["pr-regen"],
				{
					githubPr: { currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Old", body: "", headRefName: "feature/demo", baseRefName: "main" } },
					textGeneration: { results: [{ ok: true, text: generatedText }] },
				},
				{ env: { ASDL_DEV_PR_DESCRIPTION_PROMPT: promptPath } },
			);

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain(`Prompt: ${promptPath}`);
			expect(run.textGeneration.generateTextCalls[0]?.system).toBe("custom system prompt");
		} finally {
			await rm(promptPath, { force: true });
		}
	});

	test("unreadable prompt env path exits 2", async () => {
		const run = runWithFakes(
			["pr-regen"],
			{
				githubPr: { currentPr: { number: 123, url: "https://github.com/acme/project/pull/123", title: "Old", body: "", headRefName: "feature/demo", baseRefName: "main" } },
			},
			{ env: { ASDL_DEV_PR_DESCRIPTION_PROMPT: "/path/that/does/not/exist.md" } },
		);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Could not read ASDL_DEV_PR_DESCRIPTION_PROMPT");
	});

	test("unknown options exit 2", async () => {
		const run = runWithFakes(["pr-regen", "--bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Unknown option: --bogus");
		expect(run.githubPr.viewCurrentBranchPrCalls).toEqual([]);
	});
});
