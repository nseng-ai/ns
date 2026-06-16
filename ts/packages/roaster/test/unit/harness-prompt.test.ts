import { describe, expect, test } from "vitest";

import {
	assembleReviewPrompt,
	buildClaudeDiffFindingsJsonSchema,
	isClaudeCodeSupportedModel,
	renderPromptFence,
	systemPromptFindings,
} from "../../src/gateways/harness.ts";
import { createLocalDiff, type ReviewDefinition } from "../../src/models.ts";

const reviewDefinition: ReviewDefinition = {
	name: "typescript-style",
	description: "Review TypeScript diffs.",
	instructions: "Flag concrete issues.",
	defaultModel: "haiku",
	applicability: { include: ["**/*.ts"], exclude: [] },
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

		const assembled = assembleReviewPrompt({ reviewDefinition, target: { localDiff } });

		expect(assembled.promptText.startsWith("Reviewer name: typescript-style")).toBe(true);
		expect(assembled.promptText).toContain("Reviewer description: Review TypeScript diffs.");
		expect(assembled.promptText).toContain("Flag concrete issues.");
		expect(assembled.promptText).toContain("- Base ref: main");
		expect(assembled.promptText).toContain("- Changed paths: 1");
		expect(assembled.promptText).toContain("Changed paths:\n- src/app.ts");
		expect(assembled.promptText).toContain("```diff\ndiff --git a/src/app.ts b/src/app.ts");
		expect(assembled.promptText.endsWith("\n")).toBe(false);
	});

	test("renders no changed paths and collision-free diff fences", () => {
		const localDiff = createLocalDiff({ baseRef: "main", diffText: "added ``` fence", files: [] });

		const assembled = assembleReviewPrompt({ reviewDefinition, target: { localDiff } });

		expect(assembled.promptText).toContain("(no changed paths reported)");
		expect(renderPromptFence("added ``` fence", { language: "diff" })).toBe("````diff\nadded ``` fence\n````");
	});
});

describe("Claude Code harness schema and model support", () => {
	test.each(["sonnet", "opus", "haiku", "claude-3-5-sonnet"])("accepts supported model %s", (model) => {
		expect(isClaudeCodeSupportedModel(model)).toBe(true);
	});

	test("rejects unsupported model names", () => {
		expect(isClaudeCodeSupportedModel("gpt-4")).toBe(false);
	});

	test("builds a ref-free findings JSON schema", () => {
		const schema = buildClaudeDiffFindingsJsonSchema();
		const schemaText = JSON.stringify(schema);
		const properties = ((schema.properties as { findings: { items: Record<string, unknown> } }).findings.items);
		const findingProperties = properties.properties as { line: Record<string, unknown>; severity: Record<string, unknown> };

		expect(schemaText).not.toContain("$ref");
		expect(schemaText).not.toContain("$defs");
		expect(properties.required).toEqual(["path", "line", "severity", "summary", "details"]);
		expect(findingProperties.line.type).toEqual(["integer", "null"]);
		expect(findingProperties.severity.enum).toEqual(["info", "warning", "error"]);
	});
});
