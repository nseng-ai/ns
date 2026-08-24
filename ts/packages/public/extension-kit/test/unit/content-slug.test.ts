import {
	deriveContentSlug,
	type ContentSlugEvidence,
	type ContentSlugPolicy,
	type ContentSlugResult,
} from "@nseng-ai/extension-kit/content-slug";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { describe, expect, test } from "vitest";

const CONTENT = "# Add Content Slug Kit\n\nExtract slug mechanics into a shared kit helper.\n";
const CWD = "/repo";
const MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class FakeCommands implements CommandExecApi {
	readonly calls: ExecCall[] = [];
	private readonly results: Array<ExecResult | Error>;

	constructor(results: readonly (ExecResult | Error)[]) {
		this.results = [...results];
	}

	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options });
		if (command !== "pi") throw new Error(`unexpected command: ${command}`);
		const result = this.results.shift();
		if (result === undefined) throw new Error("unexpected extra slug model execution");
		if (result instanceof Error) return Promise.reject(result);
		return Promise.resolve(result);
	}
}

const TEST_POLICY = {
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
	normalization: { maxWords: 6, stripSuffixes: ["-artifact", "-session"] },
	validateSlug(slug) {
		return slug === "invalid-slug" ? "content artifact slug is reserved." : undefined;
	},
} satisfies ContentSlugPolicy;

function exited(options: { stdout?: string; stderr?: string; code?: number }): ExecResult {
	return {
		type: "exited",
		stdout: options.stdout ?? "",
		stderr: options.stderr ?? "",
		code: options.code ?? 0,
		signal: null,
	};
}

function timedOut(): ExecResult {
	return { type: "timed-out", stdout: "", stderr: "", code: 143, signal: null };
}

function input(content: string = CONTENT) {
	return { content, cwd: CWD, modelSelection: MODEL_SELECTION };
}

async function expectNoFallback(
	run: () => Promise<ContentSlugResult>,
	expectedMessage: string,
): Promise<void> {
	const result = await run();
	expect(result.ok).toBe(false);
	if (result.ok) return;
	expect(result.error.message).toContain(TEST_POLICY.failureHeader);
	expect(result.error.message).toContain(expectedMessage);
	expect(result.error.message).toContain(TEST_POLICY.noFallbackLine);
}

function expectEvidence(result: ContentSlugResult): ContentSlugEvidence {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

describe("deriveContentSlug", () => {
	test("returns normalized evidence from the supplied model selection", async () => {
		const commands = new FakeCommands([exited({ stdout: "Content Slug Kit Artifact\n" })]);
		const result = await deriveContentSlug(commands, input(), TEST_POLICY);

		expect(expectEvidence(result)).toEqual({
			slug: "content-slug-kit",
			rawOutput: "Content Slug Kit Artifact\n",
			provider: MODEL_SELECTION.provider,
			model: MODEL_SELECTION.modelId,
		});
		expect(commands.calls).toHaveLength(1);
		expect(commands.calls[0]).toMatchObject({
			command: "pi",
			options: { cwd: CWD, timeout: 60_000 },
		});
		expect(commands.calls[0]?.args).toContain(MODEL_SELECTION.provider);
		expect(commands.calls[0]?.args).toContain(MODEL_SELECTION.modelId);
		expect(commands.calls[0]?.args).toContain(MODEL_SELECTION.thinking);
	});

	test("builds the prompt, displays empty content, and truncates content", async () => {
		const commands = new FakeCommands([
			exited({ stdout: "empty-content\n" }),
			exited({ stdout: "long-content\n" }),
		]);
		await deriveContentSlug(commands, input("  "), TEST_POLICY);
		await deriveContentSlug(commands, input("abcdef"), { ...TEST_POLICY, maxContentChars: 3 });

		const emptyPrompt = commands.calls[0]?.args.at(-1);
		expect(emptyPrompt).toContain("Return exactly one slug and no prose.");
		expect(emptyPrompt).toContain("## Content\n(empty content)");
		const truncatedPrompt = commands.calls[1]?.args.at(-1);
		expect(truncatedPrompt).toContain("## Content\nabc\n\n[Content truncated for slug generation]");
		expect(truncatedPrompt).not.toContain("abcdef");
	});

	test("normalizes model output using policy suffix, word, and character caps", async () => {
		const commands = new FakeCommands([
			exited({ stdout: "\n```markdown\nShared Content Slug Session\nignored prose\n```\n" }),
			exited({ stdout: "one two three four five six seven artifact\n" }),
			exited({ stdout: "long semantic content slug\n" }),
		]);
		expect(await deriveContentSlug(commands, input(), TEST_POLICY)).toMatchObject({
			ok: true,
			value: { slug: "shared-content-slug" },
		});
		expect(await deriveContentSlug(commands, input(), TEST_POLICY)).toMatchObject({
			ok: true,
			value: { slug: "one-two-three-four-five-six" },
		});
		expect(
			await deriveContentSlug(commands, input(), {
				...TEST_POLICY,
				normalization: { maxChars: 13 },
			}),
		).toMatchObject({ ok: true, value: { slug: "long-semantic" } });
	});

	test("threads the abort signal to model execution", async () => {
		const controller = new AbortController();
		const commands = new FakeCommands([exited({ stdout: "content-slug-kit\n" })]);
		await deriveContentSlug(commands, { ...input(), signal: controller.signal }, TEST_POLICY);
		expect(commands.calls[0]?.options?.signal).toBe(controller.signal);
	});

	test("retries one killed model command and preserves successful evidence", async () => {
		const commands = new FakeCommands([timedOut(), exited({ stdout: "retried slug\n" })]);
		const result = await deriveContentSlug(commands, input(), TEST_POLICY);
		expect(result).toMatchObject({ ok: true, value: { slug: "retried-slug" } });
		expect(commands.calls).toHaveLength(2);
	});

	test("fails closed for command, empty, normalization, validation, and retry failures", async () => {
		const cases: readonly [readonly (ExecResult | Error)[], string][] = [
			[[exited({ code: 1, stderr: "model unavailable" })], "model unavailable"],
			[[new Error("spawn exploded")], "spawn exploded"],
			[[exited({ stdout: "  \n" })], "empty output"],
			[[exited({ stdout: "```\n```\n" })], "could not be normalized"],
			[[exited({ stdout: "invalid slug\n" })], "content artifact slug is reserved"],
			[[timedOut(), timedOut()], "Retried once after a killed/timeout result."],
		];
		for (const [results, message] of cases) {
			const commands = new FakeCommands(results);
			await expectNoFallback(() => deriveContentSlug(commands, input(), TEST_POLICY), message);
		}
	});
});
