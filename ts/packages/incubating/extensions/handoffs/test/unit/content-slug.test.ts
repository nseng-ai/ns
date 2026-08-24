import {
	createModelExecutionCoordinator,
	type ModelExecutionCoordinator,
} from "@nseng-ai/extension-kit/model-execution";
import { buildRawTextModelArgs } from "@nseng-ai/extension-kit/model-slug";

const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
const MODEL_EXECUTION_COORDINATOR: ModelExecutionCoordinator = { beforeExecution() {} };
import { describe, expect, test } from "vitest";
import {
	buildHandoffContentSlugPrompt,
	deriveHandoffContentSlug,
	normalizeHandoffContentSlugOutput,
} from "../../src/core/content-slug.ts";
import type { CommandExecApi, ExecResult } from "@nseng-ai/foundation/command";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

type ExitedResult = Extract<ExecResult, { type: "exited" }>;
type ExecResultFixture = Partial<Omit<ExitedResult, "type">> | Exclude<ExecResult, ExitedResult>;

const CWD = "/repo";
const projectConfig: ProjectConfigGateway = {
	readTextFile: () => ({
		type: "found",
		text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
	}),
	pathExists: () => ({ type: "missing" }),
};
const HANDOFF_CONTENT = `# Handoff: Associate Sessions With Branches

Continuation focus: Explore how to associate Pi sessions with git branches.

## Context

The next session should inspect session metadata, branch tracking, and where branch identity should be stored.

## Next Steps

- Compare existing session records with current branch lookup.
- Propose a branch-session association model.
`;

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number; signal?: AbortSignal } | undefined;
}

class FakeSlugPi implements CommandExecApi {
	readonly calls: ExecCall[] = [];
	private readonly behaviors: Array<{ result?: ExecResultFixture; error?: Error }>;

	constructor(
		behavior:
			| { result?: ExecResultFixture; error?: Error }
			| Array<{ result?: ExecResultFixture; error?: Error }>,
	) {
		this.behaviors = Array.isArray(behavior) ? [...behavior] : [behavior];
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
	): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options });
		const behavior = this.behaviors.shift();
		if (behavior === undefined) throw new Error("Unexpected model command execution.");
		if (behavior.error !== undefined) throw behavior.error;
		const result = behavior.result ?? {};
		if ("type" in result) return result;
		return {
			type: "exited",
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			code: result.code ?? 0,
			signal: result.signal ?? null,
		};
	}
}

function slugContext(
	commands: CommandExecApi,
	configGateway: ProjectConfigGateway = projectConfig,
) {
	return {
		commands,
		git: new InMemoryGitGateway({ repoRoot: CWD }),
		projectConfig: configGateway,
	};
}

function expectNoFallback(error: unknown): void {
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toContain(
		"Failed to derive handoff slug from final artifact content.",
	);
	expect((error as Error).message).toContain(
		"No continuation-focus or deterministic fallback was attempted.",
	);
}

describe("deriveHandoffContentSlug", () => {
	test("successful model output becomes a valid handoff slug", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "associate-sessions-with-branches\n" } });

		const evidence = await deriveHandoffContentSlug(slugContext(pi), {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
		});

		expect(evidence).toEqual({
			slug: "associate-sessions-with-branches",
			rawOutput: "associate-sessions-with-branches\n",
			provider: TEST_MODEL_SELECTION.provider,
			model: TEST_MODEL_SELECTION.modelId,
		});
		expect(pi.calls).toHaveLength(1);
		expect(pi.calls[0]?.command).toBe("pi");
		expect(pi.calls[0]?.args).toEqual(
			buildRawTextModelArgs(buildHandoffContentSlugPrompt(HANDOFF_CONTENT), TEST_MODEL_SELECTION),
		);
		expect(pi.calls[0]?.options).toMatchObject({ cwd: CWD, timeout: 60_000 });
	});

	test("presents the built-in model warning before execution", async () => {
		const events: string[] = [];
		const pi = new FakeSlugPi({ result: { stdout: "associate-sessions-with-branches\n" } });
		const missingConfig: ProjectConfigGateway = {
			readTextFile: () => ({ type: "missing" }),
			pathExists: () => ({ type: "missing" }),
		};
		const modelExecutionCoordinator = createModelExecutionCoordinator({
			warn: (warning) => {
				expect(pi.calls).toHaveLength(0);
				events.push(warning);
			},
		});

		await deriveHandoffContentSlug(slugContext(pi, missingConfig), {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelExecutionCoordinator,
		});

		expect(events).toHaveLength(1);
		expect(events[0]).toContain("using built-in");
	});

	test("markdown and code-fenced output normalizes correctly", async () => {
		const pi = new FakeSlugPi({
			result: { stdout: "```markdown\nBranch Session Association Handoff!!!\n```\n" },
		});

		const evidence = await deriveHandoffContentSlug(slugContext(pi), {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
		});

		expect(evidence.slug).toBe("branch-session-association");
	});

	test("overlong output is repaired to at most eight words", async () => {
		const pi = new FakeSlugPi({
			result: {
				stdout: "session branch association model metadata lookup persistence design notes\n",
			},
		});

		const evidence = await deriveHandoffContentSlug(slugContext(pi), {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
		});

		expect(evidence.slug).toBe(
			"session-branch-association-model-metadata-lookup-persistence-design",
		);
	});

	test("nonzero model command fails with no fallback", async () => {
		const pi = new FakeSlugPi({ result: { code: 1, stderr: "model unavailable" } });

		try {
			await deriveHandoffContentSlug(slugContext(pi), {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
			});
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("model unavailable");
		}
	});

	test("empty model output fails with no fallback", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "  \n" } });

		try {
			await deriveHandoffContentSlug(slugContext(pi), {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
			});
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("empty output");
		}
	});

	test("a timeout retries once and succeeds with model evidence", async () => {
		const pi = new FakeSlugPi([
			{
				result: { type: "timed-out", stdout: "", stderr: "", code: 143, signal: null },
			},
			{ result: { stdout: "associate-sessions-with-branches\n" } },
		]);

		const evidence = await deriveHandoffContentSlug(slugContext(pi), {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
		});

		expect(evidence.slug).toBe("associate-sessions-with-branches");
		expect(pi.calls).toHaveLength(2);
		expect(pi.calls.every((call) => call.options?.timeout === 60_000)).toBe(true);
	});

	test("two timeout results fail after one retry with no fallback", async () => {
		const timedOut = {
			type: "timed-out" as const,
			stdout: "",
			stderr: "",
			code: 143,
			signal: null,
		};
		const pi = new FakeSlugPi([{ result: timedOut }, { result: timedOut }]);

		try {
			await deriveHandoffContentSlug(slugContext(pi), {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
			});
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("Retried once after a killed/timeout result.");
			expect(pi.calls).toHaveLength(2);
		}
	});

	test("malformed model output fails with no fallback", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "!!!\n" } });

		try {
			await deriveHandoffContentSlug(slugContext(pi), {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
			});
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("could not be normalized");
		}
	});

	test("generic-only normalized output fails", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "handoff session continue\n" } });

		try {
			await deriveHandoffContentSlug(slugContext(pi), {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelExecutionCoordinator: MODEL_EXECUTION_COORDINATOR,
			});
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("Normalized slug: handoff-session-continue");
			expect((error as Error).message).toContain("generic handoff words");
		}
	});

	test("prompt includes final content and excludes focus/path sources", () => {
		const prompt = buildHandoffContentSlugPrompt(HANDOFF_CONTENT);

		expect(prompt).toContain(HANDOFF_CONTENT.trim());
		expect(prompt).toContain(
			"Do not use the original request/focus, current branch, filename, path",
		);
		expect(prompt).toContain("Return exactly one slug and no prose.");
		expect(prompt).not.toContain("i want to handoff to a sesssion");
		expect(prompt).not.toContain("/tmp/handoff.md");
	});

	test("normalizer removes generic suffixes only when useful slug remains", () => {
		expect(normalizeHandoffContentSlugOutput("Branch Session Association Session\n")).toBe(
			"branch-session-association",
		);
		expect(normalizeHandoffContentSlugOutput("Handoff\n")).toBe("handoff");
	});
});
