import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
	appendGeneratedMarker,
	buildPrDescriptionUserPrompt,
	filterLockfileSections,
	GENERATED_BODY_MARKER,
	hasGeneratedMarker,
	isCommitMessagePrefillBody,
	parsePrDescriptionOutput,
	PR_DESCRIPTION_PROMPT_ENV,
	resolvePrDescriptionPrompt,
	truncateDiff,
} from "../../src/pr-description.ts";

function validDraft(): string {
	return `Add pluggable PR descriptions

This updates submit to generate PR descriptions through the asdl prompt pipeline.

## Key Changes

- Adds PR description preparation
- Updates submit behavior`;
}

describe("PR description helpers", () => {
	test("parses title and body after stripping an outer code fence", () => {
		expect(parsePrDescriptionOutput(`\`\`\`markdown\n${validDraft()}\n\`\`\``)).toEqual({
			ok: true,
			description: {
				title: "Add pluggable PR descriptions",
				body: "This updates submit to generate PR descriptions through the asdl prompt pipeline.\n\n## Key Changes\n\n- Adds PR description preparation\n- Updates submit behavior",
			},
		});
	});

	test("rejects empty body, overlong titles, and attribution footers", () => {
		const parsed = parsePrDescriptionOutput(`${"x".repeat(121)}\n\nGenerated with Claude Code`);

		expect(parsed).toMatchObject({
			ok: false,
			issues: [{ type: "title_too_long" }, { type: "attribution_footer" }],
		});
	});

	test("marker helpers append and detect the generated body marker", () => {
		const body = appendGeneratedMarker("Body text");

		expect(body).toBe(`Body text\n\n${GENERATED_BODY_MARKER}`);
		expect(hasGeneratedMarker(body)).toBe(true);
	});

	test("detects a body that exactly matches a commit message body", () => {
		const commits = [{ headline: "Add widget", body: "Implements the widget flow." }];

		expect(isCommitMessagePrefillBody("Implements the widget flow.", commits)).toBe(true);
	});

	test("detects a prefill body despite trailing-newline differences", () => {
		const commits = [{ headline: "Add widget", body: "Implements the widget flow.\n" }];

		expect(isCommitMessagePrefillBody("Implements the widget flow.", commits)).toBe(true);
	});

	test("detects a prefill body matching a later commit of a multi-commit PR", () => {
		const commits = [
			{ headline: "First commit", body: "First body." },
			{ headline: "Second commit", body: "Second body." },
		];

		expect(isCommitMessagePrefillBody("Second body.", commits)).toBe(true);
	});

	test("does not treat hand-edited text as a prefill body", () => {
		const commits = [{ headline: "Add widget", body: "Implements the widget flow." }];

		expect(isCommitMessagePrefillBody("Manually rewritten description.", commits)).toBe(false);
	});

	test("does not treat an empty PR body as a prefill body, even with bodyless commits", () => {
		expect(isCommitMessagePrefillBody("", [{ headline: "Add widget" }])).toBe(false);
		expect(isCommitMessagePrefillBody("  \n", [{ headline: "Add widget", body: "" }])).toBe(false);
	});

	test("does not match a commit without a body", () => {
		expect(isCommitMessagePrefillBody("Some body.", [{ headline: "Add widget" }])).toBe(false);
	});

	test("filters lockfile diff sections and keeps source sections", () => {
		const filtered = filterLockfileSections(
			[
				"diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n+lock\n",
				"diff --git a/src/app.ts b/src/app.ts\n+code\n",
				"diff --git a/packages/app/package-lock.json b/packages/app/package-lock.json\n+lock\n",
			].join(""),
		);

		expect(filtered).toContain("src/app.ts");
		expect(filtered).not.toContain("pnpm-lock.yaml");
		expect(filtered).not.toContain("package-lock.json");
	});

	test("truncates large diffs with an explicit marker", () => {
		const truncated = truncateDiff(`${"a".repeat(80)}${"b".repeat(80)}`, 100);

		expect(truncated).toContain("[... TRUNCATED 60 chars ...]");
		expect(truncated.length).toBeLessThanOrEqual(100);
	});

	test("builds context, commit messages, and diff into the user prompt", () => {
		const prompt = buildPrDescriptionUserPrompt({
			kind: "github",
			number: 12,
			url: "https://github.com/acme/project/pull/12",
			title: "Current title",
			headRefName: "feature/demo",
			baseRefName: "main",
			commitMessages: [{ headline: "Add feature", body: "Body" }],
			diff: "diff --git a/src/app.ts b/src/app.ts\n+code\n",
		});

		expect(prompt).toContain("## Context");
		expect(prompt).toContain("- PR: #12");
		expect(prompt).toContain("## Commit Messages");
		expect(prompt).toContain("Add feature\n\nBody");
		expect(prompt).toContain("## Diff");
		expect(prompt).toContain("Generate a PR title and body for this diff:");
	});

	test("resolves prompts env path before repo override before builtin", async () => {
		const root = join(tmpdir(), `asdl-dev-pr-prompt-${randomUUID()}`);
		const repoPromptDir = join(root, "repo", ".asdl", "prompts");
		await mkdir(repoPromptDir, { recursive: true });
		await writeFile(join(repoPromptDir, "pr-description.md"), "repo prompt", "utf8");
		const envPath = join(root, "env.md");
		await writeFile(envPath, "env prompt", "utf8");

		await expect(resolvePrDescriptionPrompt({ env: { [PR_DESCRIPTION_PROMPT_ENV]: envPath }, repoRoot: join(root, "repo") })).resolves.toMatchObject({
			ok: true,
			text: "env prompt",
			source: { type: "env" },
		});
		await expect(resolvePrDescriptionPrompt({ env: {}, repoRoot: join(root, "repo") })).resolves.toMatchObject({
			ok: true,
			text: "repo prompt",
			source: { type: "repo" },
		});
	});
});
