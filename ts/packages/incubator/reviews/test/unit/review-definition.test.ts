import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import type { ReviewApplicability, ReviewDefinition } from "../../src/core/models.ts";
import {
	parseReviewDefinition,
	type ReviewDefinitionParseErrorCode,
} from "../../src/core/review-definition.ts";

const NS_TYPESCRIPT_STYLE_TRIPWIRE_PATH =
	"../../../../../../.ns/reviews/ns-typescript-style-tripwire/review.md";

interface RealReviewCase {
	readonly path: string;
	readonly name: string;
	readonly expectedModelProfile: string;
	readonly expectedApplicability: ReviewApplicability;
	readonly expectedLocalOnly: boolean;
}

const REAL_REVIEW_CASES: readonly RealReviewCase[] = [
	{
		path: "../../../../../../.ns/reviews/thermonuclear-review/review.md",
		name: "thermonuclear-review",
		expectedModelProfile: "deep",
		expectedApplicability: {
			include: ["**/*.ts", "**/*.tsx", "**/*.py"],
			exclude: [".agents/skills/**", ".claude/skills/**", "skills/**"],
		},
		expectedLocalOnly: true,
	},
	{
		path: "../../../../../../.ns/reviews/improve-codebase-architecture/review.md",
		name: "improve-codebase-architecture",
		expectedModelProfile: "deep",
		expectedApplicability: {
			include: ["**/*.ts", "**/*.tsx", "**/*.py"],
			exclude: [
				"**/tests/**",
				"**/test/**",
				"**/*.test.ts",
				"**/test_*.py",
				".agents/skills/**",
				".claude/skills/**",
				"skills/**",
			],
		},
		expectedLocalOnly: true,
	},
	{
		path: NS_TYPESCRIPT_STYLE_TRIPWIRE_PATH,
		name: "ns-typescript-style-tripwire",
		expectedModelProfile: "fast",
		expectedApplicability: {
			include: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
			exclude: [],
		},
		expectedLocalOnly: false,
	},
	{
		path: "../../../../../../.ns/reviews/reinvented-abstractions-tripwire/review.md",
		name: "reinvented-abstractions-tripwire",
		expectedModelProfile: "fast",
		expectedApplicability: {
			include: ["**/*.ts", "**/*.tsx"],
			exclude: ["**/tests/**", "**/test/**", "**/*.test.ts", ".agents/skills/**"],
		},
		expectedLocalOnly: false,
	},
	{
		path: "../../../../../../.ns/reviews/dry-but-not-too-dry/review.md",
		name: "dry-but-not-too-dry",
		expectedModelProfile: "deep",
		expectedApplicability: {
			include: ["**/*.ts", "**/*.tsx", "**/*.py"],
			exclude: [
				"**/tests/**",
				"**/test/**",
				"**/*.test.ts",
				"**/test_*.py",
				".agents/skills/**",
				".claude/skills/**",
				"skills/**",
			],
		},
		expectedLocalOnly: true,
	},
];

describe("parseReviewDefinition", () => {
	test.each(REAL_REVIEW_CASES)("parses real review definition $name", (reviewCase) => {
		const source = readFileSync(new URL(reviewCase.path, import.meta.url), "utf8");

		const definition = expectOk(parseReviewDefinition(source, { name: reviewCase.name }));

		expect(definition.name).toBe(reviewCase.name);
		expect(definition.description.trim()).not.toBe("");
		expect(definition.modelProfile).toBe(reviewCase.expectedModelProfile);
		expect(definition.applicability).toEqual(reviewCase.expectedApplicability);
		expect(definition.localOnly).toBe(reviewCase.expectedLocalOnly);
		expect(definition.instructions.trim()).not.toBe("");
	});

	test("preserves the actionable undefined tripwire instructions", () => {
		const source = readFileSync(
			new URL(NS_TYPESCRIPT_STYLE_TRIPWIRE_PATH, import.meta.url),
			"utf8",
		);

		const definition = expectOk(
			parseReviewDefinition(source, { name: "ns-typescript-style-tripwire" }),
		);

		expect(definition.instructions).toContain("**Actionable failure erased as `undefined`.**");
		expect(definition.instructions).toContain("ordinary collection/map/index lookups");
	});

	test("parses a simple definition", () => {
		const definition = expectOk(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					"model_profile: sonnet\n" +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python-tripwire" },
			),
		);

		expect(definition).toEqual({
			name: "dignified-python-tripwire",
			description: "Review Python diffs for style violations.",
			instructions: "Flag concrete issues in the diff.",
			modelProfile: "sonnet",
			applicability: { include: [], exclude: [] },
			localOnly: false,
		});
	});

	test("parses local-only review definitions", () => {
		const definition = expectOk(
			parseReviewDefinition(
				"---\n" +
					"description: Review architecture diffs.\n" +
					"model_profile: sonnet\n" +
					"local_only: true\n" +
					"---\n" +
					"\n" +
					"Flag high-context architecture issues.\n",
				{ name: "architecture-review" },
			),
		);

		expect(definition.localOnly).toBe(true);
	});

	test("parses applicability and normalizes patterns", () => {
		const definition = expectOk(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					"model_profile: sonnet\n" +
					"applies_to:\n" +
					"  include:\n" +
					"    - ' **\\*.py '\n" +
					"  exclude:\n" +
					"    - '**/tests/**/*.py'\n" +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python-tripwire" },
			),
		);

		expect(definition.applicability).toEqual({
			include: ["**/*.py"],
			exclude: ["**/tests/**/*.py"],
		});
	});

	test("allows missing model profile", () => {
		const definition = expectOk(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python-tripwire" },
			),
		);

		expect(definition.modelProfile).toBe("fast");
		expect(definition.applicability).toEqual({ include: [], exclude: [] });
		expect(definition.localOnly).toBe(false);
	});

	test.each([
		["Review definition is empty.", "", "empty-source"],
		[
			"frontmatter fence",
			"# Dignified Python\n\nSome prose without frontmatter.\n",
			"missing-open-fence",
		],
		[
			"closing",
			"---\ndescription: Review Python diffs for style violations.\n\nFlag concrete issues in the diff.\n",
			"missing-close-fence",
		],
		[
			"description",
			"---\nmodel_profile: sonnet\n---\n\nFlag concrete issues in the diff.\n",
			"invalid-description",
		],
		[
			"instructions",
			"---\ndescription: Review Python diffs for style violations.\n---\n",
			"invalid-instructions",
		],
	] as const)("rejects invalid definition: %s", (message, source, code) => {
		const error = expectError(parseReviewDefinition(source, { name: "dignified-python-tripwire" }));

		expect(error.code).toBe(code);
		expect(error.message).toContain(message);
	});

	test("requires exact first-line frontmatter fences", () => {
		expect(
			expectError(
				parseReviewDefinition(
					"\n---\ndescription: Review Python diffs for style violations.\n---\n\nFlag concrete issues in the diff.\n",
					{ name: "dignified-python-tripwire" },
				),
			).code,
		).toBe("missing-open-fence");
		expect(
			expectError(
				parseReviewDefinition(
					" ---\ndescription: Review Python diffs for style violations.\n---\n\nFlag concrete issues in the diff.\n",
					{ name: "dignified-python-tripwire" },
				),
			).code,
		).toBe("missing-open-fence");
		expect(
			expectError(
				parseReviewDefinition(
					"--- \ndescription: Review Python diffs for style violations.\n---\n\nFlag concrete issues in the diff.\n",
					{ name: "dignified-python-tripwire" },
				),
			).code,
		).toBe("missing-open-fence");
		expect(
			expectError(
				parseReviewDefinition(
					"---\ndescription: Review Python diffs for style violations.\n ---\n\nFlag concrete issues in the diff.\n",
					{ name: "dignified-python-tripwire" },
				),
			).code,
		).toBe("missing-close-fence");
		expect(
			expectError(
				parseReviewDefinition(
					"---\ndescription: Review Python diffs for style violations.\n--- \n\nFlag concrete issues in the diff.\n",
					{ name: "dignified-python-tripwire" },
				),
			).code,
		).toBe("missing-close-fence");
	});

	test("requires non-empty name", () => {
		const error = expectError(
			parseReviewDefinition(
				"---\ndescription: Review Python diffs for style violations.\n---\n\nFlag concrete issues in the diff.\n",
				{ name: "   " },
			),
		);

		expect(error.code).toBe("invalid-name");
		expect(error.message).toContain("name");
	});

	test("lists unknown frontmatter keys and allowed fields", () => {
		const error = expectError(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					"model_profile: sonnet\n" +
					"severity: error\n" +
					"owner: team-platform\n" +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python-tripwire" },
			),
		);

		expect(error.code).toBe("unknown-frontmatter-key");
		expect(error.message).toContain("`owner`");
		expect(error.message).toContain("`severity`");
		expect(error.message).toContain("Allowed fields:");
	});

	test.each(["sonnet", "opus", "haiku", "claude-sonnet-4-6", "gpt-5-mini"])(
		"accepts model profile %s",
		(model) => {
			const definition = expectOk(
				parseReviewDefinition(
					`---\ndescription: Review Python diffs for style violations.\nmodel_profile: ${model}\n---\n\nFlag concrete issues in the diff.\n`,
					{ name: "dignified-python-tripwire" },
				),
			);

			expect(definition.modelProfile).toBe(model);
		},
	);

	test.each(["", "   ", "[]", "123"])("rejects invalid model profile %#", (modelProfile) => {
		const error = expectError(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					`model_profile: ${modelProfile}\n` +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python-tripwire" },
			),
		);

		expect(error.code).toBe("invalid-model-profile");
	});

	test.each(["yes", '"true"', "1", "[]"])("rejects invalid local_only %#", (localOnly) => {
		const error = expectError(
			parseReviewDefinition(
				"---\n" +
					"description: Review Python diffs for style violations.\n" +
					`local_only: ${localOnly}\n` +
					"---\n" +
					"\n" +
					"Flag concrete issues in the diff.\n",
				{ name: "dignified-python-tripwire" },
			),
		);

		expect(error.code).toBe("invalid-local-only");
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
				{ name: "dignified-python-tripwire" },
			),
		);

		expect(error.code).toBe("invalid-applicability");
		expect(error.message).toContain(message);
	});
});

type ParseResult = ReturnType<typeof parseReviewDefinition>;

function expectOk(result: ParseResult): ReviewDefinition {
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

function expectError(result: ParseResult): {
	readonly code: ReviewDefinitionParseErrorCode;
	readonly message: string;
} {
	if (result.ok) throw new Error("Expected review definition parse to fail.");
	return result.error;
}
