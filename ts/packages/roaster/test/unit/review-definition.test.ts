import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { parseReviewDefinition, type ReviewDefinition, type ReviewDefinitionParseErrorCode } from "../../src/review-definition.ts";
import type { ReviewApplicability } from "../../src/review-applicability.ts";

interface RealReviewCase {
	readonly path: string;
	readonly name: string;
	readonly expectedModel: string;
	readonly expectedApplicability: ReviewApplicability;
}

const REAL_REVIEW_CASES: readonly RealReviewCase[] = [
	{
		path: "../../../../../reviews/dignified-python.md",
		name: "dignified-python",
		expectedModel: "haiku",
		expectedApplicability: { include: ["**/*.py"], exclude: ["**/tests/**/*.py"] },
	},
	{
		path: "../../../../../reviews/asdl-typescript-style.md",
		name: "asdl-typescript-style",
		expectedModel: "haiku",
		expectedApplicability: { include: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"], exclude: [] },
	},
	{
		path: "../../../../../reviews/duplicative-abstractions.md",
		name: "duplicative-abstractions",
		expectedModel: "haiku",
		expectedApplicability: {
			include: ["**/*.ts", "**/*.tsx", "**/*.py"],
			exclude: ["**/tests/**", "**/test/**", "**/*.test.ts", "**/test_*.py", ".agents/skills/**"],
		},
	},
];

describe("parseReviewDefinition", () => {
	test.each(REAL_REVIEW_CASES)("parses real review definition $name", (reviewCase) => {
		const source = readFileSync(new URL(reviewCase.path, import.meta.url), "utf8");

		const definition = expectOk(parseReviewDefinition(source, { name: reviewCase.name }));

		expect(definition.name).toBe(reviewCase.name);
		expect(definition.description.trim()).not.toBe("");
		expect(definition.defaultModel).toBe(reviewCase.expectedModel);
		expect(definition.applicability).toEqual(reviewCase.expectedApplicability);
		expect(definition.instructions.trim()).not.toBe("");
	});

	test("parses a simple definition", () => {
		const definition = expectOk(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					"default_model: sonnet\n" +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python" },
			),
		);

		expect(definition).toEqual({
			name: "dignified-python",
			description: "Review Python diffs for style violations.",
			instructions: "Flag concrete issues in the diff.",
			defaultModel: "sonnet",
			applicability: { include: [], exclude: [] },
		});
	});

	test("parses applicability and normalizes patterns", () => {
		const definition = expectOk(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					"default_model: sonnet\n" +
					"applies_to:\n" +
					"  include:\n" +
					"    - ' **\\*.py '\n" +
					"  exclude:\n" +
					"    - '**/tests/**/*.py'\n" +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python" },
			),
		);

		expect(definition.applicability).toEqual({ include: ["**/*.py"], exclude: ["**/tests/**/*.py"] });
	});

	test("allows missing default model", () => {
		const definition = expectOk(
			parseReviewDefinition(
				"---\n" + "description: Review Python diffs for style violations.\n" + "---\n" + "\n" + "Flag concrete issues in the diff.\n",
				{ name: "dignified-python" },
			),
		);

		expect(definition.defaultModel).toBeNull();
		expect(definition.applicability).toEqual({ include: [], exclude: [] });
	});

	test.each([
		["Review definition is empty.", "", "empty_source"],
		["frontmatter fence", "# Dignified Python\n\nSome prose without frontmatter.\n", "missing_open_fence"],
		["closing", "---\ndescription: Review Python diffs for style violations.\n\nFlag concrete issues in the diff.\n", "missing_close_fence"],
		["description", "---\ndefault_model: sonnet\n---\n\nFlag concrete issues in the diff.\n", "invalid_description"],
		["instructions", "---\ndescription: Review Python diffs for style violations.\n---\n", "invalid_instructions"],
	] as const)("rejects invalid definition: %s", (message, source, code) => {
		const error = expectError(parseReviewDefinition(source, { name: "dignified-python" }));

		expect(error.code).toBe(code);
		expect(error.message).toContain(message);
	});

	test("requires exact first-line frontmatter fences", () => {
		expect(expectError(parseReviewDefinition("\n---\ndescription: Review Python diffs for style violations.\n---\n\nFlag concrete issues in the diff.\n", { name: "dignified-python" })).code).toBe("missing_open_fence");
		expect(expectError(parseReviewDefinition(" ---\ndescription: Review Python diffs for style violations.\n---\n\nFlag concrete issues in the diff.\n", { name: "dignified-python" })).code).toBe("missing_open_fence");
		expect(expectError(parseReviewDefinition("--- \ndescription: Review Python diffs for style violations.\n---\n\nFlag concrete issues in the diff.\n", { name: "dignified-python" })).code).toBe("missing_open_fence");
		expect(expectError(parseReviewDefinition("---\ndescription: Review Python diffs for style violations.\n ---\n\nFlag concrete issues in the diff.\n", { name: "dignified-python" })).code).toBe("missing_close_fence");
		expect(expectError(parseReviewDefinition("---\ndescription: Review Python diffs for style violations.\n--- \n\nFlag concrete issues in the diff.\n", { name: "dignified-python" })).code).toBe("missing_close_fence");
	});

	test("requires non-empty name", () => {
		const error = expectError(
			parseReviewDefinition("---\ndescription: Review Python diffs for style violations.\n---\n\nFlag concrete issues in the diff.\n", { name: "   " }),
		);

		expect(error.code).toBe("invalid_name");
		expect(error.message).toContain("name");
	});

	test("lists unknown frontmatter keys and allowed fields", () => {
		const error = expectError(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					"default_model: sonnet\n" +
					"severity: error\n" +
					"owner: team-platform\n" +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python" },
			),
		);

		expect(error.code).toBe("unknown_frontmatter_key");
		expect(error.message).toContain("`owner`");
		expect(error.message).toContain("`severity`");
		expect(error.message).toContain("Allowed fields:");
	});

	test.each(["sonnet", "opus", "haiku", "claude-sonnet-4-6", "gpt-5-mini"])("accepts default model %s", (model) => {
		const definition = expectOk(
			parseReviewDefinition(
				`---\ndescription: Review Python diffs for style violations.\ndefault_model: ${model}\n---\n\nFlag concrete issues in the diff.\n`,
				{ name: "dignified-python" },
			),
		);

		expect(definition.defaultModel).toBe(model);
	});

	test.each(["", "   ", "[]", "123"])("rejects invalid default model %#", (defaultModel) => {
		const error = expectError(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					`default_model: ${defaultModel}\n` +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python" },
			),
		);

		expect(error.code).toBe("invalid_default_model");
	});

	test.each([
		["applies_to: []\n", "applies_to"],
		["applies_to:\n  include:\n    - '**/*.py'\n  owner: team-platform\n", "unknown field"],
		["applies_to:\n  exclude:\n    - '**/tests/**/*.py'\n", "applies_to.include"],
		["applies_to:\n  include: []\n", "applies_to.include"],
		["applies_to:\n  include: '**/*.py'\n", "list of strings"],
		["applies_to:\n  include:\n    - 123\n", "non-empty strings"],
		["applies_to:\n  include:\n    - ''\n", "non-empty strings"],
		["applies_to:\n  include:\n    - '/src/**/*.py'\n", "repo-relative"],
		["applies_to:\n  include:\n    - '../src/**/*.py'\n", "must not contain `..`"],
		["applies_to:\n  include:\n    - ':(glob)**/*.py'\n", "not git pathspecs"],
	])("rejects invalid applicability %#", (appliesToYaml, message) => {
		const error = expectError(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					appliesToYaml +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python" },
			),
		);

		expect(error.code).toBe("invalid_applicability");
		expect(error.message).toContain(message);
	});
});

type ParseResult = ReturnType<typeof parseReviewDefinition>;

function expectOk(result: ParseResult): ReviewDefinition {
	if (result.type === "error") throw new Error(result.error.message);
	return result.definition;
}

function expectError(result: ParseResult): { readonly code: ReviewDefinitionParseErrorCode; readonly message: string } {
	if (result.type === "ok") throw new Error("Expected review definition parse to fail.");
	return result.error;
}
