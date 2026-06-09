import { describe, expect, test } from "vitest";

import { buildSlugModelArgs, DEFAULT_SLUG_MODEL } from "@asdl/plans";
import {
	buildHandoffContentSlugPrompt,
	deriveHandoffContentSlug,
	normalizeHandoffContentSlugOutput,
} from "../src/handoff/content-slug.ts";
import type { ExecResult } from "../src/command-runtime.ts";
import type { ExtensionAPI } from "../src/handoff.ts";

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

class FakeSlugPi implements Pick<ExtensionAPI, "exec"> {
	readonly calls: ExecCall[] = [];
	private readonly behavior: { result?: Partial<ExecResult>; error?: Error };

	constructor(behavior: { result?: Partial<ExecResult>; error?: Error }) {
		this.behavior = behavior;
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options });
		if (this.behavior.error !== undefined) {
			throw this.behavior.error;
		}
		const result = this.behavior.result ?? {};
		return {
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			code: result.code ?? 0,
			killed: result.killed ?? false,
		};
	}
}

function expectNoFallback(error: unknown): void {
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toContain("Failed to derive handoff slug from final artifact content.");
	expect((error as Error).message).toContain("No continuation-focus or deterministic fallback was attempted.");
}

describe("deriveHandoffContentSlug", () => {
	test("successful model output becomes a valid handoff slug", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "associate-sessions-with-branches\n" } });

		const evidence = await deriveHandoffContentSlug(pi, { content: HANDOFF_CONTENT, cwd: CWD });

		expect(evidence).toEqual({
			slug: "associate-sessions-with-branches",
			rawOutput: "associate-sessions-with-branches\n",
			provider: DEFAULT_SLUG_MODEL.provider,
			model: DEFAULT_SLUG_MODEL.modelId,
		});
		expect(pi.calls).toHaveLength(1);
		expect(pi.calls[0]?.command).toBe("pi");
		expect(pi.calls[0]?.args).toEqual(buildSlugModelArgs(buildHandoffContentSlugPrompt(HANDOFF_CONTENT)));
		expect(pi.calls[0]?.options).toMatchObject({ cwd: CWD, timeout: 60_000 });
	});

	test("markdown and code-fenced output normalizes correctly", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "```markdown\nBranch Session Association Handoff!!!\n```\n" } });

		const evidence = await deriveHandoffContentSlug(pi, { content: HANDOFF_CONTENT, cwd: CWD });

		expect(evidence.slug).toBe("branch-session-association");
	});

	test("overlong output is repaired to at most eight words", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "session branch association model metadata lookup persistence design notes\n" } });

		const evidence = await deriveHandoffContentSlug(pi, { content: HANDOFF_CONTENT, cwd: CWD });

		expect(evidence.slug).toBe("session-branch-association-model-metadata-lookup-persistence-design");
	});

	test("nonzero model command fails with no fallback", async () => {
		const pi = new FakeSlugPi({ result: { code: 1, stderr: "model unavailable" } });

		try {
			await deriveHandoffContentSlug(pi, { content: HANDOFF_CONTENT, cwd: CWD });
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("model unavailable");
		}
	});

	test("empty model output fails with no fallback", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "  \n" } });

		try {
			await deriveHandoffContentSlug(pi, { content: HANDOFF_CONTENT, cwd: CWD });
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("empty output");
		}
	});

	test("generic-only normalized output fails", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "handoff session continue\n" } });

		try {
			await deriveHandoffContentSlug(pi, { content: HANDOFF_CONTENT, cwd: CWD });
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
		expect(prompt).toContain("Do not use the original request/focus, current branch, filename, path");
		expect(prompt).toContain("Return exactly one slug and no prose.");
		expect(prompt).not.toContain("i want to handoff to a sesssion");
		expect(prompt).not.toContain("/tmp/handoff.md");
	});

	test("normalizer removes generic suffixes only when useful slug remains", () => {
		expect(normalizeHandoffContentSlugOutput("Branch Session Association Session\n")).toBe("branch-session-association");
		expect(normalizeHandoffContentSlugOutput("Handoff\n")).toBe("handoff");
	});
});
