import { describe, expect, test } from "vitest";

import { buildReviewFindingsJsonSchema } from "../../src/gateways/review-findings-output.ts";
import {
	assembleReviewPrompt,
	MAX_PROMPT_CHANGED_PATHS,
	renderPromptFence,
	systemPromptFindings,
} from "../../src/gateways/review-runner-prompt.ts";
import {
	createLocalDiff,
	createRevisionRangeLocalDiff,
	type PriorFindingsPromptContext,
	type ReviewDefinition,
} from "../../src/core/models.ts";

const reviewDefinition: ReviewDefinition = {
	name: "typescript-style",
	description: "Review TypeScript diffs.",
	instructions: "Flag concrete issues.",
	modelProfile: "fast",
	applicability: { include: ["**/*.ts"], exclude: [] },
	localOnly: false,
};

describe("Claude Code harness prompt assembly", () => {
	test("loads the trimmed system prompt asset", () => {
		const prompt = systemPromptFindings();

		expect(prompt).toContain("You are a CI PR-diff reviewer.");
		expect(prompt.endsWith("\n")).toBe(false);
	});

	test("substitutes named fields, changed paths, fenced diff, and trims the final prompt", () => {
		const localDiff = createLocalDiff({
			baseRef: "main",
			diffText: "diff --git a/src/app.ts b/src/app.ts\n+const value = 1;\n",
			files: [
				{
					path: "src/app.ts",
					oldPath: null,
					changeKind: "modified",
					rawText: "diff --git a/src/app.ts b/src/app.ts\n+const value = 1;\n",
					isBinary: false,
					addedLines: 1,
					removedLines: 0,
					hunkCount: 1,
					byteSize: 57,
					estimatedTokens: 15,
				},
			],
		});

		const assembled = assembleReviewPrompt({
			reviewDefinition,
			reviewDir: "/repo/.ns/reviews/typescript-style",
			target: { localDiff },
		});

		expect(assembled.promptText.startsWith("Reviewer name: typescript-style")).toBe(true);
		expect(assembled.promptText).toContain("Reviewer description: Review TypeScript diffs.");
		expect(assembled.promptText).toContain("Flag concrete issues.");
		expect(assembled.promptText).toContain("- Base ref: main");
		expect(assembled.promptText).toContain("- Changed paths: 1");
		expect(assembled.promptText).toContain("Changed paths:\n- src/app.ts");
		expect(assembled.promptText).toContain("```diff\ndiff --git a/src/app.ts b/src/app.ts");
		expect(assembled.promptText.endsWith("\n")).toBe(false);
	});

	test("labels revision-range prompt metadata honestly", () => {
		const localDiff = createRevisionRangeLocalDiff({
			revisionRange: "stack-base..stack-head",
			diffText: "diff",
			files: [],
		});

		const assembled = assembleReviewPrompt({
			reviewDefinition,
			reviewDir: "/repo/.ns/reviews/typescript-style",
			target: { localDiff },
		});

		expect(assembled.promptText).toContain("- Revision range: stack-base..stack-head");
		expect(assembled.promptText).not.toContain("- Base ref: stack-base..stack-head");
	});

	test("renders no changed paths and collision-free diff fences without convergence context by default", () => {
		const localDiff = createLocalDiff({ baseRef: "main", diffText: "added ``` fence", files: [] });

		const assembled = assembleReviewPrompt({
			reviewDefinition,
			reviewDir: "/repo/.ns/reviews/typescript-style",
			target: { localDiff },
		});

		expect(assembled.promptText).toContain("(no changed paths reported)");
		expect(assembled.promptText).not.toContain("Prior review convergence context");
		expect(assembled.promptText).not.toContain("Do not re-raise a previously surfaced finding");
		expect(renderPromptFence("added ``` fence", { language: "diff" })).toBe(
			"````diff\nadded ``` fence\n````",
		);
	});

	test("threads prior findings convergence context into prompt assembly", () => {
		const localDiff = createLocalDiff({
			baseRef: "main",
			diffText: "diff --git a/src/app.ts b/src/app.ts\n+const value = 1;\n",
			files: [],
		});

		const assembled = assembleReviewPrompt({
			reviewDefinition,
			reviewDir: "/repo/.ns/reviews/typescript-style",
			target: { localDiff },
			priorFindingsContext: priorFindingsContext(),
		});

		expect(assembled.promptText).toContain("Prior review convergence context:");
		expect(assembled.promptText).toContain("- Last-reviewed head: head-abc");
		expect(assembled.promptText).toContain("- Last-reviewed base merge-base: merge-base-def");
		expect(assembled.promptText).toContain("range-diff semantics");
		expect(assembled.promptText).toContain("Do not re-raise a previously surfaced finding");
		expect(assembled.promptText).toContain(
			"[unresolved] src/app.ts:12 warning: Prefer nullish coalescing.",
		);
		expect(assembled.promptText).toContain("Unresolved prior findings are already known feedback");
		expect(assembled.promptText).toContain("[resolved] src/old.ts info: Remove stale comment.");
		expect(assembled.promptText).toContain(
			"Resolved prior findings are considered addressed for unchanged code",
		);
		expect(assembled.promptText).toContain(
			"Anchoring guard: suppress only the same underlying prior issue",
		);
		expect(assembled.promptText).toContain(
			"Still surface genuinely new issues, including issues in the same file, nearby lines, or code adjacent to a prior finding.",
		);
	});

	test("falls back to prior-findings-only guidance without a last-reviewed head", () => {
		const localDiff = createLocalDiff({ baseRef: "main", diffText: "diff", files: [] });

		const assembled = assembleReviewPrompt({
			reviewDefinition,
			reviewDir: "/repo/.ns/reviews/typescript-style",
			target: { localDiff },
			priorFindingsContext: priorFindingsContext({ lastReviewedHead: null }),
		});

		expect(assembled.promptText).toContain("- Last-reviewed head: unavailable.");
		expect(assembled.promptText).toContain("fall back to Prior-findings-only convergence");
		expect(assembled.promptText).toContain("Review the supplied diff normally for new issues");
	});

	test("caps changed path metadata for large reviews", () => {
		const files = Array.from({ length: MAX_PROMPT_CHANGED_PATHS + 2 }, (_, index) => {
			const path = `src/file-${index}.ts`;
			const rawText = `diff --git a/${path} b/${path}\n+change\n`;
			return {
				path,
				oldPath: null,
				changeKind: "modified" as const,
				rawText,
				isBinary: false,
				addedLines: 1,
				removedLines: 0,
				hunkCount: 1,
				byteSize: rawText.length,
				estimatedTokens: 10,
			};
		});
		const localDiff = createLocalDiff({
			baseRef: "main",
			diffText: files.map((file) => file.rawText).join(""),
			files,
		});

		const assembled = assembleReviewPrompt({
			reviewDefinition,
			reviewDir: "/repo/.ns/reviews/typescript-style",
			target: { localDiff },
		});

		expect(assembled.promptText).toContain(`- Changed paths: ${MAX_PROMPT_CHANGED_PATHS + 2}`);
		expect(assembled.promptText).toContain(`- src/file-${MAX_PROMPT_CHANGED_PATHS - 1}.ts`);
		expect(assembled.promptText).not.toContain(`- src/file-${MAX_PROMPT_CHANGED_PATHS}.ts`);
		expect(assembled.promptText).toContain(
			"... 2 additional changed paths omitted from prompt metadata; use repository tools if you need the full path list.",
		);
	});
});

function priorFindingsContext(
	overrides: Partial<Pick<PriorFindingsPromptContext, "lastReviewedHead">> = {},
): PriorFindingsPromptContext {
	const lastReviewedHead =
		"lastReviewedHead" in overrides
			? overrides.lastReviewedHead
			: {
					headSha: "head-abc",
					baseRef: "main",
					baseMergeBaseSha: "merge-base-def",
				};
	return {
		prNumber: 123,
		reviewName: "typescript-style",
		summaryCommentId: 456,
		lastReviewedHead,
		cap: 10,
		stampedFindingCount: 3,
		omittedByContextCap: 1,
		cumulativePrunedCount: 2,
		findings: [
			{
				id: "finding-unresolved",
				finding: {
					path: "src/app.ts",
					line: 12,
					severity: "warning",
					summary: "Prefer nullish coalescing.",
					details: "The previous review flagged `||` defaulting here.",
				},
				firstSeenHeadSha: "old-head-1",
				lastSeenHeadSha: "head-abc",
				resolutionStatus: "unresolved",
				reviewThreadIds: ["thread-1"],
				hasOutdatedReviewThread: false,
			},
			{
				id: "finding-resolved",
				finding: {
					path: "src/old.ts",
					line: null,
					severity: "info",
					summary: "Remove stale comment.",
					details: "The previous review considered this a cleanup-only finding.",
				},
				firstSeenHeadSha: "old-head-2",
				lastSeenHeadSha: "head-abc",
				resolutionStatus: "resolved",
				reviewThreadIds: [],
				hasOutdatedReviewThread: true,
			},
		],
	};
}

describe("shared review findings schema", () => {
	test("builds a ref-free findings JSON schema", () => {
		const schema = buildReviewFindingsJsonSchema();
		const schemaText = JSON.stringify(schema);
		const properties = (schema.properties as { findings: { items: Record<string, unknown> } })
			.findings.items;
		const findingProperties = properties.properties as {
			line: Record<string, unknown>;
			severity: Record<string, unknown>;
		};

		expect(schemaText).not.toContain("$ref");
		expect(schemaText).not.toContain("$defs");
		expect(properties.required).toEqual(["path", "line", "severity", "summary", "details"]);
		expect(findingProperties.line.anyOf).toEqual([
			{ type: "integer", exclusiveMinimum: 0, maximum: Number.MAX_SAFE_INTEGER },
			{ type: "null" },
		]);
		expect(findingProperties.severity.enum).toEqual(["info", "warning", "error"]);
	});
});
