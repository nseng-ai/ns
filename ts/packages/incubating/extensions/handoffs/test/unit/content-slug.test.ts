import { assertFocusedRawTextModelArgs } from "@nseng-ai/extension-kit/model-slug/testing";
import { deriveHandoffContentSlug } from "@nseng-ai/handoffs/api";
import type { CommandExecApi, ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};

type ExitedResult = Extract<ExecResult, { type: "exited" }>;
type ExecResultFixture = Partial<Omit<ExitedResult, "type">> | Exclude<ExecResult, ExitedResult>;

const CWD = "/repo";

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

function expectNoFallback(result: Awaited<ReturnType<typeof deriveHandoffContentSlug>>): string {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected slug derivation to fail");
	expect(result.error.message).toContain(
		"Failed to derive handoff slug from final artifact content.",
	);
	expect(result.error.message).toContain(
		"No continuation-focus or deterministic fallback was attempted.",
	);
	return result.error.message;
}

function expectEvidence(result: Awaited<ReturnType<typeof deriveHandoffContentSlug>>) {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

describe("deriveHandoffContentSlug", () => {
	test("successful model output becomes a valid handoff slug", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "associate-sessions-with-branches\n" } });

		const evidence = await deriveHandoffContentSlug(pi, {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		expect(expectEvidence(evidence)).toEqual({
			slug: "associate-sessions-with-branches",
			rawOutput: "associate-sessions-with-branches\n",
			provider: TEST_MODEL_SELECTION.provider,
			model: TEST_MODEL_SELECTION.modelId,
		});
		expect(pi.calls).toHaveLength(1);
		expect(pi.calls[0]?.command).toBe("pi");
		const prompt = assertFocusedRawTextModelArgs(pi.calls[0]?.args ?? [], TEST_MODEL_SELECTION);
		expect(prompt).toContain(HANDOFF_CONTENT.trim());
		expect(prompt).toContain(
			"Do not use the original request/focus, current branch, filename, path",
		);
		expect(prompt).toContain("Return exactly one slug and no prose.");
		expect(prompt).not.toContain("i want to handoff to a sesssion");
		expect(prompt).not.toContain("/tmp/handoff.md");
		expect(pi.calls[0]?.options).toMatchObject({ cwd: CWD, timeout: 60_000 });
	});

	test("markdown and code-fenced output normalizes correctly", async () => {
		const pi = new FakeSlugPi({
			result: { stdout: "```markdown\nBranch Session Association Handoff!!!\n```\n" },
		});

		const evidence = await deriveHandoffContentSlug(pi, {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		expect(expectEvidence(evidence).slug).toBe("branch-session-association");
	});

	test("overlong output is repaired to at most eight words", async () => {
		const pi = new FakeSlugPi({
			result: {
				stdout: "session branch association model metadata lookup persistence design notes\n",
			},
		});

		const evidence = await deriveHandoffContentSlug(pi, {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		expect(expectEvidence(evidence).slug).toBe(
			"session-branch-association-model-metadata-lookup-persistence-design",
		);
	});

	test("repeated handoff suffixes are stripped", async () => {
		const pi = new FakeSlugPi({
			result: { stdout: "associate-sessions-with-branches-handoff-session-handoff\n" },
		});

		const evidence = await deriveHandoffContentSlug(pi, {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		expect(expectEvidence(evidence).slug).toBe("associate-sessions-with-branches");
	});

	test("prompt truncates final content at 32k characters and marks the truncation", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "continue-branch-association\n" } });
		const omittedTail = "OMITTED-TAIL";

		await deriveHandoffContentSlug(pi, {
			content: `${"a".repeat(32_001)}${omittedTail}`,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		const prompt = pi.calls[0]?.args.at(-1) ?? "";
		expect(prompt).toContain("a".repeat(32_000));
		expect(prompt).toContain("[Handoff content truncated for slug generation]");
		expect(prompt).not.toContain(omittedTail);
	});

	test("nonzero model command fails with no fallback", async () => {
		const pi = new FakeSlugPi({ result: { code: 1, stderr: "model unavailable" } });

		const message = expectNoFallback(
			await deriveHandoffContentSlug(pi, {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelSelection: TEST_MODEL_SELECTION,
			}),
		);
		expect(message).toContain("model unavailable");
	});

	test("empty model output fails with no fallback", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "  \n" } });

		const message = expectNoFallback(
			await deriveHandoffContentSlug(pi, {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelSelection: TEST_MODEL_SELECTION,
			}),
		);
		expect(message).toContain("empty output");
	});

	test("a timeout retries once and succeeds with model evidence", async () => {
		const pi = new FakeSlugPi([
			{
				result: { type: "timed-out", stdout: "", stderr: "", code: 143, signal: null },
			},
			{ result: { stdout: "associate-sessions-with-branches\n" } },
		]);

		const evidence = await deriveHandoffContentSlug(pi, {
			content: HANDOFF_CONTENT,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		expect(expectEvidence(evidence).slug).toBe("associate-sessions-with-branches");
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

		const message = expectNoFallback(
			await deriveHandoffContentSlug(pi, {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelSelection: TEST_MODEL_SELECTION,
			}),
		);
		expect(message).toContain("Retried once after a killed/timeout result.");
		expect(pi.calls).toHaveLength(2);
	});

	test("malformed model output fails with no fallback", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "!!!\n" } });

		const message = expectNoFallback(
			await deriveHandoffContentSlug(pi, {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelSelection: TEST_MODEL_SELECTION,
			}),
		);
		expect(message).toContain("could not be normalized");
	});

	test("generic-only normalized output fails", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "handoff session continue\n" } });

		const message = expectNoFallback(
			await deriveHandoffContentSlug(pi, {
				content: HANDOFF_CONTENT,
				cwd: CWD,
				modelSelection: TEST_MODEL_SELECTION,
			}),
		);
		expect(message).toContain("Normalized slug: handoff-session-continue");
		expect(message).toContain("generic handoff words");
	});
});
