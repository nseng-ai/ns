import { describe, expect, test } from "vitest";

import {
	buildKitContentSlugPrompt,
	deriveKitContentSlug,
	normalizeContentSlugOutput,
	truncateContentForSlug,
	type ContentSlugDerivationVariant,
} from "@nseng-ai/capability-kit/content-slug";
import {
	buildRawTextModelArgs,
	type RawTextModelCommandResult,
	type RawTextModelExecOptions,
} from "@nseng-ai/capability-kit/model-slug";
import { DEFAULT_FAST_MODEL } from "@nseng-ai/foundation/model-slug";

const CWD = "/repo";
const CONTENT = "# Add Content Slug Kit\n\nExtract slug mechanics into a shared kit helper.\n";

interface ExecCall {
	command: string;
	args: string[];
	options: RawTextModelExecOptions;
}

class FakeSlugExec {
	readonly calls: ExecCall[] = [];
	private readonly results: RawTextModelCommandResult[];

	constructor(results: RawTextModelCommandResult | readonly RawTextModelCommandResult[]) {
		this.results = Array.isArray(results) ? [...results] : [results];
	}

	exec(
		command: string,
		args: string[],
		options: RawTextModelExecOptions,
	): Promise<RawTextModelCommandResult> {
		this.calls.push({ command, args: [...args], options: { ...options } });
		const result = this.results.shift();
		if (result === undefined) {
			throw new Error("unexpected extra slug model execution");
		}
		return Promise.resolve(result);
	}
}

const TEST_VARIANT: ContentSlugDerivationVariant = {
	slugKind: "content artifact slug",
	promptIntroLines: [
		"Generate a content artifact slug for the Markdown content below.",
		"Use only the final content.",
	],
	promptRuleLines: [
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Prefer a concise 3–6 word slug.",
	],
	contentHeading: "## Content",
	emptyContentPlaceholder: "(empty content)",
	maxContentChars: 80,
	truncationMessage: "[Content truncated for slug generation]",
	invalidSlugMessage: "Pi slug model output normalized to an invalid content artifact slug.",
	failureHeader: "Failed to derive content artifact slug.",
	noFallbackLine: "No deterministic fallback was attempted.",
	normalization: {
		maxWords: 6,
		stripSuffixes: ["-artifact", "-session"],
	},
	validateSlug(slug) {
		return slug === "invalid-slug" ? "content artifact slug is reserved." : undefined;
	},
};

function expectNoFallback(error: unknown): void {
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toContain(TEST_VARIANT.failureHeader);
	expect((error as Error).message).toContain(TEST_VARIANT.noFallbackLine);
}

describe("deriveKitContentSlug", () => {
	test("successful model output yields content slug evidence", async () => {
		const exec = new FakeSlugExec({
			type: "exited",
			stdout: "Content Slug Kit Artifact\n",
			stderr: "",
			code: 0,
			signal: null,
		});

		const evidence = await deriveKitContentSlug(
			exec,
			{ content: CONTENT, cwd: CWD, modelRef: "openai-codex/gpt-5.6-luna", thinking: "off" },
			TEST_VARIANT,
		);

		expect(evidence).toEqual({
			slug: "content-slug-kit",
			rawOutput: "Content Slug Kit Artifact\n",
			provider: DEFAULT_FAST_MODEL.provider,
			model: DEFAULT_FAST_MODEL.modelId,
		});
		expect(exec.calls).toEqual([
			{
				command: "pi",
				args: buildRawTextModelArgs(
					buildKitContentSlugPrompt(CONTENT, TEST_VARIANT),
					DEFAULT_FAST_MODEL,
					"off",
				),
				options: { cwd: CWD, timeout: 60_000 },
			},
		]);
	});

	test("threads abort signals into model execution", async () => {
		const controller = new AbortController();
		const exec = new FakeSlugExec({
			type: "exited",
			stdout: "Content Slug Kit\n",
			stderr: "",
			code: 0,
			signal: null,
		});

		await deriveKitContentSlug(
			exec,
			{
				content: CONTENT,
				cwd: CWD,
				modelRef: "openai-codex/gpt-5.6-luna",
				thinking: "off",
				signal: controller.signal,
			},
			TEST_VARIANT,
		);

		expect(exec.calls[0]?.options.signal).toBe(controller.signal);
	});

	test("model failure, empty output, invalid slug, and repeated killed result fail without fallback", async () => {
		const failureCases: readonly [string, FakeSlugExec, string][] = [
			[
				"nonzero",
				new FakeSlugExec({
					type: "exited",
					stdout: "",
					stderr: "model unavailable",
					code: 1,
					signal: null,
				}),
				"model unavailable",
			],
			[
				"empty",
				new FakeSlugExec({ type: "exited", code: 0, signal: null, stdout: "  \n", stderr: "" }),
				"empty output",
			],
			[
				"invalid",
				new FakeSlugExec({
					type: "exited",
					code: 0,
					signal: null,
					stdout: "invalid slug\n",
					stderr: "",
				}),
				"content artifact slug is reserved",
			],
			[
				"killed twice",
				new FakeSlugExec([
					{ type: "timed-out", code: 143, signal: null, stdout: "", stderr: "" },
					{ type: "timed-out", code: 143, signal: null, stdout: "", stderr: "" },
				]),
				"Retried once after a killed/timeout result.",
			],
		];

		for (const [, exec, expectedMessage] of failureCases) {
			try {
				await deriveKitContentSlug(
					exec,
					{ content: CONTENT, cwd: CWD, modelRef: "openai-codex/gpt-5.6-luna", thinking: "off" },
					TEST_VARIANT,
				);
				throw new Error("expected slug derivation to fail");
			} catch (error) {
				expectNoFallback(error);
				expect((error as Error).message).toContain(expectedMessage);
			}
		}
	});
});

describe("content slug prompt and normalization helpers", () => {
	test("prompt assembly includes only variant text and content", () => {
		const prompt = buildKitContentSlugPrompt(CONTENT, TEST_VARIANT);

		expect(prompt).toContain(TEST_VARIANT.promptIntroLines[0]);
		expect(prompt).toContain("Return exactly one slug and no prose.");
		expect(prompt).toContain("## Content");
		expect(prompt).toContain(CONTENT.trim());
		expect(prompt).not.toContain("/tmp/content.md");
		expect(prompt).not.toContain("feature/content-slug");
	});

	test("markdown output, word caps, and useful suffix stripping normalize consistently", () => {
		expect(
			normalizeContentSlugOutput("```markdown\nShared Content Slug Session\n```\n", {
				maxWords: 4,
				stripSuffixes: ["-session"],
			}),
		).toBe("shared-content-slug");
		expect(
			normalizeContentSlugOutput("one two three four five\n", {
				maxWords: 3,
			}),
		).toBe("one-two-three");
		expect(
			normalizeContentSlugOutput("Session\n", {
				maxWords: 4,
				stripSuffixes: ["-session"],
			}),
		).toBe("session");
	});

	test("truncateContentForSlug appends the variant truncation message", () => {
		expect(
			truncateContentForSlug("abcdef", {
				maxContentChars: 3,
				truncationMessage: "[truncated]",
			}),
		).toBe("abc\n\n[truncated]");
	});
});
