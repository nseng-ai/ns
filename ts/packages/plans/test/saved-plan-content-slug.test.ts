import { describe, expect, test } from "vitest";

import {
	DEFAULT_FAST_MODEL,
	buildSavedPlanContentSlugPrompt,
	buildSlugModelArgs,
	deriveSavedPlanContentSlug,
} from "../src/index.ts";
import type { ExecResult } from "@asdl/core/exec";
import type { CommandExecApi, ExecOptions } from "@asdl/core/exec";

const CWD = "/repo";
const SAVED_PLAN_CONTENT = "# Branch Scoped Plan Extension\n\nPersist saved plans from final content.\n";

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class FakeSlugPi implements CommandExecApi {
	readonly calls: ExecCall[] = [];
	private readonly behavior: { result?: Partial<ExecResult>; error?: Error };

	constructor(behavior: { result?: Partial<ExecResult>; error?: Error }) {
		this.behavior = behavior;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
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

function expectSavedPlanNoFallback(error: unknown): void {
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toContain("Failed to derive saved-plan filename slug from plan content.");
	expect((error as Error).message).toContain("No assistant-generated slug or deterministic fallback was attempted.");
}

describe("deriveSavedPlanContentSlug", () => {
	test("successful model output becomes a valid saved-plan filename slug", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "branch-scoped-plan-extension\n" } });

		const evidence = await deriveSavedPlanContentSlug(pi, { content: SAVED_PLAN_CONTENT, cwd: CWD });

		expect(evidence).toEqual({
			slug: "branch-scoped-plan-extension",
			rawOutput: "branch-scoped-plan-extension\n",
			provider: DEFAULT_FAST_MODEL.provider,
			model: DEFAULT_FAST_MODEL.modelId,
		});
		expect(pi.calls).toHaveLength(1);
		expect(pi.calls[0]?.command).toBe("pi");
		expect(pi.calls[0]?.args).toEqual(buildSlugModelArgs(buildSavedPlanContentSlugPrompt(SAVED_PLAN_CONTENT)));
		expect(pi.calls[0]?.options).toMatchObject({ cwd: CWD, timeout: 60_000 });
	});

	test("invalid normalized slug output fails with saved-plan-specific failure text", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "work plan task\n" } });

		try {
			await deriveSavedPlanContentSlug(pi, { content: SAVED_PLAN_CONTENT, cwd: CWD });
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectSavedPlanNoFallback(error);
			expect((error as Error).message).toContain("Pi slug model output normalized to an invalid saved-plan filename slug.");
			expect((error as Error).message).toContain("Normalized slug: work-plan-task");
		}
	});

	test("prompt uses only final plan content for saved-plan slugging", () => {
		const prompt = buildSavedPlanContentSlugPrompt(SAVED_PLAN_CONTENT);

		expect(prompt).toContain(SAVED_PLAN_CONTENT.trim());
		expect(prompt).toContain("Do not use the current branch, repository name, request text, filename, or path.");
		expect(prompt).not.toContain("branch-contexts/add-widget");
		expect(prompt).not.toContain("/tmp/saved-plan.md");
	});
});
