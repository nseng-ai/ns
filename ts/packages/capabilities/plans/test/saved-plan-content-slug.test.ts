import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
import { buildRawTextModelArgs } from "@nseng-ai/capability-kit/model-slug";
import { buildSavedPlanContentSlugPrompt, deriveSavedPlanContentSlug } from "../src/index.ts";
import type { ExecResult } from "@nseng-ai/foundation/exec";

type ExitedResult = Extract<ExecResult, { type: "exited" }>;
type ExecResultFixture = Partial<Omit<ExitedResult, "type">> | Exclude<ExecResult, ExitedResult>;
import type { CommandExecApi, ExecOptions } from "@nseng-ai/foundation/exec";

const CWD = mkdtempSync(join(tmpdir(), "saved-plan-slug-root-"));
writeFileSync(
	join(CWD, "ns.toml"),
	'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
);
const SAVED_PLAN_CONTENT =
	"# Branch Scoped Plan Extension\n\nPersist saved plans from final content.\n";

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class FakeSlugPi implements CommandExecApi {
	readonly calls: ExecCall[] = [];
	private readonly behavior: { result?: ExecResultFixture; error?: Error };

	constructor(behavior: { result?: ExecResultFixture; error?: Error }) {
		this.behavior = behavior;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options });
		if (command === "git" && args[0] === "rev-parse") {
			return { type: "exited", stdout: `${CWD}\n`, stderr: "", code: 0, signal: null };
		}
		if (this.behavior.error !== undefined) {
			throw this.behavior.error;
		}
		const result = this.behavior.result ?? {};
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

function expectSavedPlanNoFallback(error: unknown): void {
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toContain(
		"Failed to derive saved-plan filename slug from plan content.",
	);
	expect((error as Error).message).toContain(
		"No assistant-generated slug or deterministic fallback was attempted.",
	);
}

describe("deriveSavedPlanContentSlug", () => {
	test("successful model output becomes a valid saved-plan filename slug", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "branch-scoped-plan-extension\n" } });

		const evidence = await deriveSavedPlanContentSlug(pi, {
			content: SAVED_PLAN_CONTENT,
			cwd: CWD,
		});

		expect(evidence).toEqual({
			slug: "branch-scoped-plan-extension",
			rawOutput: "branch-scoped-plan-extension\n",
			provider: TEST_MODEL_SELECTION.provider,
			model: TEST_MODEL_SELECTION.modelId,
		});
		expect(pi.calls).toHaveLength(2);
		expect(pi.calls[0]?.command).toBe("git");
		expect(pi.calls[0]?.args).toEqual(["rev-parse", "--show-toplevel"]);
		expect(pi.calls[1]?.command).toBe("pi");
		expect(pi.calls[1]?.args).toEqual(
			buildRawTextModelArgs(
				buildSavedPlanContentSlugPrompt(SAVED_PLAN_CONTENT),
				TEST_MODEL_SELECTION,
			),
		);
		expect(pi.calls[1]?.options).toMatchObject({ cwd: CWD, timeout: 60_000 });
	});

	test("invalid normalized slug output fails with saved-plan-specific failure text", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "work plan task\n" } });

		try {
			await deriveSavedPlanContentSlug(pi, { content: SAVED_PLAN_CONTENT, cwd: CWD });
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectSavedPlanNoFallback(error);
			expect((error as Error).message).toContain(
				"Pi slug model output normalized to an invalid saved-plan filename slug.",
			);
			expect((error as Error).message).toContain("Normalized slug: work-plan-task");
		}
	});

	test("prompt uses only final plan content for saved-plan slugging", () => {
		const prompt = buildSavedPlanContentSlugPrompt(SAVED_PLAN_CONTENT);

		expect(prompt).toContain(SAVED_PLAN_CONTENT.trim());
		expect(prompt).toContain(
			"Do not use the current branch, repository name, request text, filename, or path.",
		);
		expect(prompt).not.toContain("branch-contexts/add-widget");
		expect(prompt).not.toContain("/tmp/saved-plan.md");
	});
});
