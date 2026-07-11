import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { TextGenerationResult } from "@nseng-ai/capability-kit/text-generation";
import {
	appendGeneratedMarker,
	buildPrDescriptionUserPrompt,
	filterLockfileSections,
	formatManagedGeneratedRegion,
	GENERATED_BODY_MARKER,
	hashPrDescriptionPrompt,
	MAX_DIFF_CHARS,
	hasGeneratedMarker,
	isCommitMessagePrefillBody,
	parseManagedGeneratedRegion,
	parsePrDescriptionOutput,
	preparePrDescription,
	PR_DESCRIPTION_PROMPT_ENV,
	replaceOrInsertGeneratedRegion,
	resolvePrDescriptionPrompt,
	truncateDiff,
} from "../../src/submit/index.ts";
import { writeTestPointManifest } from "../support/point-manifest.ts";

function validDraft(): string {
	return `Add pluggable PR descriptions

This updates submit to generate PR descriptions through the ns prompt pipeline.

## Key Changes

- Adds PR description preparation
- Updates submit behavior`;
}

describe("PR description helpers", () => {
	test("reports elapsed model-generation progress through the preparation seam", async () => {
		const clock = createManualClock(0);
		const timers = createManualTimerScheduler();
		let resolveModel!: (result: TextGenerationResult) => void;
		let markStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const pendingModel = new Promise<TextGenerationResult>((resolve) => {
			resolveModel = resolve;
		});
		const progress: string[] = [];
		const result = preparePrDescription({
			textGenerator: {
				generateText: async () => {
					markStarted();
					return await pendingModel;
				},
			},
			modelRef: "anthropic/claude-sonnet-4-5",
			promptText: "Write a PR description.",
			context: {
				kind: "github",
				number: 12,
				url: "https://github.com/acme/project/pull/12",
				title: "Current title",
				headRefName: "feature/demo",
				baseRefName: "main",
				commitMessages: [{ headline: "Add feature" }],
				diff: "diff --git a/src/app.ts b/src/app.ts\n+code\n",
			},
			onProgress: (message) => progress.push(message),
			time: { clock: clock.clock, timers: timers.timers },
		});

		await started;
		expect(progress).toContain("generating PR metadata (attempt 1/2)");

		clock.advanceMs(5_000);
		timers.advanceMs(5_000);
		expect(progress).toContain("still generating PR metadata (5s elapsed)");

		clock.advanceMs(5_000);
		timers.advanceMs(5_000);
		expect(progress).toContain("still generating PR metadata (10s elapsed)");

		resolveModel({ ok: true, text: validDraft() });
		expect(await result).toMatchObject({ ok: true });
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("parses title and body after stripping an outer code fence", () => {
		expect(parsePrDescriptionOutput(`\`\`\`markdown\n${validDraft()}\n\`\`\``)).toEqual({
			ok: true,
			description: {
				title: "Add pluggable PR descriptions",
				body: "This updates submit to generate PR descriptions through the ns prompt pipeline.\n\n## Key Changes\n\n- Adds PR description preparation\n- Updates submit behavior",
			},
		});
	});

	test("normalizes CRLF and lone CR separators at the parser boundary", () => {
		const expected = parsePrDescriptionOutput(validDraft());

		expect(parsePrDescriptionOutput(validDraft().replace(/\n/g, "\r\n"))).toEqual(expected);
		expect(parsePrDescriptionOutput(validDraft().replace(/\n/g, "\r"))).toEqual(expected);
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

	test("formats, parses, and replaces the managed generated region", () => {
		const metadata = {
			version: "2" as const,
			patchId: "patch-1",
			promptHash: hashPrDescriptionPrompt("prompt"),
			generator: "ns-pr-description-v2",
		};
		const region = formatManagedGeneratedRegion("Generated body", metadata);

		expect(region).toContain("<details open>");
		expect(parseManagedGeneratedRegion(region)).toMatchObject({
			type: "found",
			metadata,
			body: "Generated body",
		});
		expect(
			replaceOrInsertGeneratedRegion(`Intro\n\n${region}\n\nFooter`, "New generated body", {
				...metadata,
				patchId: "patch-2",
			}),
		).toBe(
			`Intro\n\n${formatManagedGeneratedRegion("New generated body", { ...metadata, patchId: "patch-2" })}\n\nFooter`,
		);
	});

	test("inserts managed generated regions before unowned human body content", () => {
		const metadata = {
			version: "2" as const,
			patchId: "patch-1",
			promptHash: hashPrDescriptionPrompt("prompt"),
			generator: "ns-pr-description-v2",
		};

		expect(replaceOrInsertGeneratedRegion("Human note", "Generated body", metadata)).toBe(
			`${formatManagedGeneratedRegion("Generated body", metadata)}\n\nHuman note`,
		);
	});

	test("treats duplicate managed generated regions as malformed", () => {
		const metadata = {
			version: "2" as const,
			patchId: "patch-1",
			promptHash: hashPrDescriptionPrompt("prompt"),
			generator: "ns-pr-description-v2",
		};
		const region = formatManagedGeneratedRegion("Generated body", metadata);

		expect(parseManagedGeneratedRegion(`${region}\n\n${region}`)).toMatchObject({
			type: "malformed",
		});
	});

	test("legacy generated marker bodies regenerate as fully machine-owned", () => {
		const metadata = {
			version: "2" as const,
			patchId: "patch-1",
			promptHash: hashPrDescriptionPrompt("prompt"),
			generator: "ns-pr-description-v2",
		};

		expect(
			replaceOrInsertGeneratedRegion(
				`Old generated\n\n${GENERATED_BODY_MARKER}`,
				"Generated body",
				metadata,
			),
		).toBe(formatManagedGeneratedRegion("Generated body", metadata));
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

	test("keeps default PR description diff prompt below small-model context limits", () => {
		const truncated = truncateDiff(`${"a".repeat(MAX_DIFF_CHARS)}overflow`);

		expect(truncated).toContain("[... TRUNCATED 8 chars ...]");
		expect(truncated.length).toBeLessThanOrEqual(MAX_DIFF_CHARS);
	});

	test("builds context, commit headlines, and diff into the user prompt", () => {
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
		expect(prompt).toContain(
			"- Current PR title (stale context only; regenerate from the diff): Current title",
		);
		expect(prompt).toContain("## Commit Messages");
		expect(prompt).toContain("Add feature");
		expect(prompt).not.toContain("Body");
		expect(prompt).toContain("## Diff");
		expect(prompt).toContain(
			"Generate a fresh PR title and body for this diff. Do not preserve an existing PR title unless the diff independently supports it:",
		);
	});

	test("omits commit bodies from the generation prompt so stale PR descriptions are not echoed", () => {
		const prompt = buildPrDescriptionUserPrompt({
			kind: "github",
			number: 1587,
			url: "https://github.com/acme/project/pull/1587",
			title: "Current title",
			headRefName: "feature/demo",
			baseRefName: "main",
			commitMessages: [
				{
					headline: "Address PR stack feedback",
					body: "Prior generated PR description.\n\n## Key Changes\n\n- Old generated detail\n\nCo-Authored-By: Example <noreply@example.com>",
				},
			],
			diff: "diff --git a/src/app.ts b/src/app.ts\n+code\n",
		});

		expect(prompt).toContain("Address PR stack feedback");
		expect(prompt).not.toContain("Prior generated PR description");
		expect(prompt).not.toContain("Co-Authored-By");
	});

	test("resolves prompts env path before repo override before builtin", async () => {
		const root = join(tmpdir(), `ns-dev-pr-prompt-${randomUUID()}`);
		const repo = join(root, "repo");
		const repoPromptDir = join(repo, ".ns", "prompts");
		await mkdir(repoPromptDir, { recursive: true });
		await writeTestPointManifest(repo, {
			group: "flow",
			points: [
				{
					path: ["submit", "pr-description"],
					accepts: "prompt",
					semantics: "override",
				},
			],
		});
		await writeFile(join(repoPromptDir, "flow.submit.pr-description.md"), "repo prompt", "utf8");
		const envPath = join(root, "env.md");
		await writeFile(envPath, "env prompt", "utf8");

		await expect(
			resolvePrDescriptionPrompt({
				env: { [PR_DESCRIPTION_PROMPT_ENV]: envPath },
				repoRoot: repo,
			}),
		).resolves.toMatchObject({
			ok: true,
			text: "env prompt",
			source: { type: "env" },
		});
		await expect(resolvePrDescriptionPrompt({ env: {}, repoRoot: repo })).resolves.toMatchObject({
			ok: true,
			text: "repo prompt",
			source: { type: "repo" },
		});
		await expect(
			resolvePrDescriptionPrompt({
				env: { [PR_DESCRIPTION_PROMPT_ENV]: envPath },
				cwd: root,
			}),
		).resolves.toMatchObject({
			ok: true,
			source: { type: "builtin" },
		});
	});
});
