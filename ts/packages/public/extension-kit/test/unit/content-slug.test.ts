import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	deriveContentSlug,
	type ContentSlugContext,
	type ContentSlugEvidence,
	type ContentSlugPolicy,
	type ContentSlugResult,
} from "@nseng-ai/extension-kit/content-slug";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { createNodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { describe, expect, test } from "vitest";

const CONTENT = "# Add Content Slug Kit\n\nExtract slug mechanics into a shared kit helper.\n";
const MODEL_CONFIG = `
[models.profiles.fast]
model = "fallback/fast-model"
thinking = "low"

[models.profiles.slugger]
model = "openai-codex/gpt-5.6-luna"
thinking = "minimal"

[models.operations]
slug = "slugger"
`;

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class FakeCommands implements CommandExecApi {
	readonly calls: ExecCall[] = [];
	private readonly repoRoot: string;
	private readonly modelResults: Array<ExecResult | Error>;
	private readonly gitResult: ExecResult | undefined;

	constructor(options: {
		repoRoot: string;
		modelResults?: readonly (ExecResult | Error)[];
		gitResult?: ExecResult;
	}) {
		this.repoRoot = options.repoRoot;
		this.modelResults = [...(options.modelResults ?? [])];
		this.gitResult = options.gitResult;
	}

	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({
			command,
			args: [...args],
			options: options === undefined ? undefined : { ...options },
		});
		if (command === "git") {
			return Promise.resolve(this.gitResult ?? exited({ stdout: `${this.repoRoot}\n` }));
		}
		if (command !== "pi") throw new Error(`unexpected command: ${command}`);
		const result = this.modelResults.shift();
		if (result === undefined) throw new Error("unexpected extra slug model execution");
		if (result instanceof Error) return Promise.reject(result);
		return Promise.resolve(result);
	}
}

function slugContext(commands: CommandExecApi): ContentSlugContext {
	return {
		commands,
		git: new RealGitGateway(commands),
		projectConfig: createNodeProjectConfigGateway(),
	};
}

const TEST_POLICY: ContentSlugPolicy = {
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

async function withRepo<T>(
	run: (repoRoot: string) => Promise<T>,
	config: string = MODEL_CONFIG,
): Promise<T> {
	const repoRoot = await mkdtemp(join(tmpdir(), "extension-kit-content-slug-"));
	try {
		await writeFile(join(repoRoot, "ns.toml"), config, "utf8");
		return await run(repoRoot);
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
}

function piCalls(commands: FakeCommands): readonly ExecCall[] {
	return commands.calls.filter((call) => call.command === "pi");
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
	test("discovers the repo and returns evidence from the configured slug model", async () => {
		await withRepo(async (repoRoot) => {
			const commands = new FakeCommands({
				repoRoot,
				modelResults: [exited({ stdout: "Content Slug Kit Artifact\n" })],
			});

			const evidence = await deriveContentSlug(
				slugContext(commands),
				{ content: CONTENT, cwd: join(repoRoot, "nested") },
				TEST_POLICY,
			);

			expect(expectEvidence(evidence)).toEqual({
				slug: "content-slug-kit",
				rawOutput: "Content Slug Kit Artifact\n",
				provider: "openai-codex",
				model: "gpt-5.6-luna",
			});
			expect(commands.calls[0]).toMatchObject({
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				options: { cwd: join(repoRoot, "nested") },
			});
			const call = piCalls(commands)[0];
			expect(call).toMatchObject({
				command: "pi",
				options: { cwd: join(repoRoot, "nested"), timeout: 60_000 },
			});
			expect(call?.args).toContain("openai-codex");
			expect(call?.args).toContain("gpt-5.6-luna");
			expect(call?.args).toContain("minimal");
			expect(call?.args).not.toContain("fallback/fast-model");
		});
	});

	test("builds the prompt, displays empty content, and truncates content", async () => {
		await withRepo(async (repoRoot) => {
			const commands = new FakeCommands({
				repoRoot,
				modelResults: [exited({ stdout: "empty-content\n" }), exited({ stdout: "long-content\n" })],
			});

			await deriveContentSlug(slugContext(commands), { content: "  ", cwd: repoRoot }, TEST_POLICY);
			await deriveContentSlug(
				slugContext(commands),
				{ content: "abcdef", cwd: repoRoot },
				{ ...TEST_POLICY, maxContentChars: 3 },
			);

			const emptyPrompt = piCalls(commands)[0]?.args.at(-1);
			expect(emptyPrompt).toContain(TEST_POLICY.promptIntroLines[0]);
			expect(emptyPrompt).toContain("Return exactly one slug and no prose.");
			expect(emptyPrompt).toContain(TEST_POLICY.promptRuleLines[0]);
			expect(emptyPrompt).toContain("## Content\n(empty content)");
			const truncatedPrompt = piCalls(commands)[1]?.args.at(-1);
			expect(truncatedPrompt).toContain(
				"## Content\nabc\n\n[Content truncated for slug generation]",
			);
			expect(truncatedPrompt).not.toContain("abcdef");
		});
	});

	test("normalizes the first model line, code fences, suffixes, and policy caps", async () => {
		await withRepo(async (repoRoot) => {
			const commands = new FakeCommands({
				repoRoot,
				modelResults: [
					exited({ stdout: "\n```markdown\nShared Content Slug Session\nignored prose\n```\n" }),
					exited({ stdout: "one two three four five six seven artifact\n" }),
					exited({ stdout: "long semantic content slug\n" }),
					exited({ stdout: "Session\n" }),
				],
			});

			expect(
				await deriveContentSlug(
					slugContext(commands),
					{ content: CONTENT, cwd: repoRoot },
					TEST_POLICY,
				),
			).toMatchObject({ ok: true, value: { slug: "shared-content-slug" } });
			expect(
				await deriveContentSlug(
					slugContext(commands),
					{ content: CONTENT, cwd: repoRoot },
					TEST_POLICY,
				),
			).toMatchObject({ ok: true, value: { slug: "one-two-three-four-five-six" } });
			expect(
				await deriveContentSlug(
					slugContext(commands),
					{ content: CONTENT, cwd: repoRoot },
					{ ...TEST_POLICY, normalization: { maxChars: 13 } },
				),
			).toMatchObject({ ok: true, value: { slug: "long-semantic" } });
			expect(
				await deriveContentSlug(
					slugContext(commands),
					{ content: CONTENT, cwd: repoRoot },
					TEST_POLICY,
				),
			).toMatchObject({ ok: true, value: { slug: "session" } });
		});
	});

	test("threads the abort signal to model execution", async () => {
		await withRepo(async (repoRoot) => {
			const controller = new AbortController();
			const commands = new FakeCommands({
				repoRoot,
				modelResults: [exited({ stdout: "content-slug-kit\n" })],
			});

			await deriveContentSlug(
				slugContext(commands),
				{ content: CONTENT, cwd: repoRoot, signal: controller.signal },
				TEST_POLICY,
			);

			expect(commands.calls.find((call) => call.command === "git")?.options?.signal).toBe(
				controller.signal,
			);
			expect(piCalls(commands)[0]?.options?.signal).toBe(controller.signal);
		});
	});

	test("retries one killed model command and preserves successful evidence", async () => {
		await withRepo(async (repoRoot) => {
			const commands = new FakeCommands({
				repoRoot,
				modelResults: [timedOut(), exited({ stdout: "retried slug\n" })],
			});

			const evidence = await deriveContentSlug(
				slugContext(commands),
				{ content: CONTENT, cwd: repoRoot },
				TEST_POLICY,
			);

			expect(evidence).toMatchObject({ ok: true, value: { slug: "retried-slug" } });
			expect(piCalls(commands)).toHaveLength(2);
		});
	});

	test("fails closed for model command, empty, normalization, validation, and retry failures", async () => {
		await withRepo(async (repoRoot) => {
			const cases: readonly [readonly (ExecResult | Error)[], string][] = [
				[[exited({ code: 1, stderr: "model unavailable" })], "model unavailable"],
				[[new Error("spawn exploded")], "spawn exploded"],
				[[exited({ stdout: "  \n" })], "empty output"],
				[[exited({ stdout: "```\n```\n" })], "could not be normalized"],
				[[exited({ stdout: "invalid slug\n" })], "content artifact slug is reserved"],
				[[timedOut(), timedOut()], "Retried once after a killed/timeout result."],
			];

			for (const [results, message] of cases) {
				const commands = new FakeCommands({ repoRoot, modelResults: results });
				await expectNoFallback(
					() =>
						deriveContentSlug(
							slugContext(commands),
							{ content: CONTENT, cwd: repoRoot },
							TEST_POLICY,
						),
					message,
				);
			}
		});
	});

	test("preserves repository and project config diagnostics", async () => {
		await withRepo(async (repoRoot) => {
			const commands = new FakeCommands({
				repoRoot,
				gitResult: exited({ code: 128, stderr: "fatal: not a git repository" }),
			});
			expect(
				await deriveContentSlug(
					slugContext(commands),
					{ content: CONTENT, cwd: repoRoot },
					TEST_POLICY,
				),
			).toEqual({
				ok: false,
				error: {
					code: "content-slug-failed",
					message: "Could not determine the repository root for ns.toml.",
				},
			});
		});

		await withRepo(async (repoRoot) => {
			const commands = new FakeCommands({ repoRoot });
			const result = await deriveContentSlug(
				slugContext(commands),
				{ content: CONTENT, cwd: repoRoot },
				TEST_POLICY,
			);
			expect(result).toMatchObject({
				ok: false,
				error: { message: expect.stringContaining("Invalid model policy in ns.toml: ns.toml:") },
			});
		}, "[models.profiles.fast\n");
	});

	test("does not convert an unexpected dependency exception into a content-slug failure", async () => {
		const context: ContentSlugContext = {
			commands: new FakeCommands({ repoRoot: "/repo" }),
			git: {
				optionalRepoRoot: () => Promise.reject(new Error("broken git dependency")),
			},
			projectConfig: createNodeProjectConfigGateway(),
		};

		await expect(
			deriveContentSlug(context, { content: CONTENT, cwd: "/repo" }, TEST_POLICY),
		).rejects.toThrow("broken git dependency");
	});
});
