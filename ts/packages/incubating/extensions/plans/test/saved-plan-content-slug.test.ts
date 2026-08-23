import { describe, expect, test } from "vitest";

const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
import { deriveSavedPlanContentSlug } from "../src/index.ts";
import type { ContentSlugContext } from "@nseng-ai/extension-kit/content-slug";
import type { ExecResult } from "@nseng-ai/foundation/exec";

type ExitedResult = Extract<ExecResult, { type: "exited" }>;
type ExecResultFixture = Partial<Omit<ExitedResult, "type">> | Exclude<ExecResult, ExitedResult>;
import type { CommandExecApi, ExecOptions } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";

const CWD = "/repo";
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

function slugContext(commands: CommandExecApi): ContentSlugContext {
	return {
		commands,
		git: new RealGitGateway(commands),
		projectConfig: {
			readTextFile: () => ({
				type: "found",
				text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
			}),
			pathExists: () => ({ type: "missing" }),
		},
	};
}

function expectSavedPlanNoFallback(
	result: Awaited<ReturnType<typeof deriveSavedPlanContentSlug>>,
): string {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected slug derivation to fail");
	expect(result.error.message).toContain(
		"Failed to derive saved-plan filename slug from plan content.",
	);
	expect(result.error.message).toContain(
		"No assistant-generated slug or deterministic fallback was attempted.",
	);
	return result.error.message;
}

describe("deriveSavedPlanContentSlug", () => {
	test("successful model output becomes a valid saved-plan filename slug", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "branch-scoped-plan-extension-plan\n" } });

		const evidence = await deriveSavedPlanContentSlug(slugContext(pi), {
			content: SAVED_PLAN_CONTENT,
			cwd: CWD,
		});

		expect(evidence).toEqual({
			ok: true,
			value: {
				slug: "branch-scoped-plan-extension",
				rawOutput: "branch-scoped-plan-extension-plan\n",
				provider: TEST_MODEL_SELECTION.provider,
				model: TEST_MODEL_SELECTION.modelId,
			},
		});
		expect(pi.calls).toHaveLength(2);
		expect(pi.calls[0]?.command).toBe("git");
		expect(pi.calls[0]?.args).toEqual(["rev-parse", "--show-toplevel"]);
		expect(pi.calls[1]?.command).toBe("pi");
		expect(pi.calls[1]?.args).toContain(TEST_MODEL_SELECTION.provider);
		expect(pi.calls[1]?.args).toContain(TEST_MODEL_SELECTION.modelId);
		const prompt = pi.calls[1]?.args.at(-1) ?? "";
		expect(prompt).toContain(SAVED_PLAN_CONTENT.trim());
		expect(prompt).toContain("Use only the final plan content.");
		expect(prompt).toContain("- Use 3–7 words.");
		expect(prompt).toContain("## Plan content");
		expect(prompt).toContain(
			"Do not use the current branch, repository name, request text, filename, or path.",
		);
		expect(prompt).not.toContain("branch-contexts/add-widget");
		expect(prompt).not.toContain("/tmp/saved-plan.md");
		expect(pi.calls[1]?.options).toMatchObject({ cwd: CWD, timeout: 60_000 });
	});

	test("truncates plan content at 32k characters in the private model prompt", async () => {
		const omittedTail = "OMITTED_PLAN_TAIL";
		const pi = new FakeSlugPi({ result: { stdout: "bounded-plan-content\n" } });

		await deriveSavedPlanContentSlug(slugContext(pi), {
			content: `${"x".repeat(32_000)}${omittedTail}`,
			cwd: CWD,
		});

		const prompt = pi.calls[1]?.args.at(-1) ?? "";
		expect(prompt).toContain("x".repeat(32_000));
		expect(prompt).toContain("[Plan content truncated for slug generation]");
		expect(prompt).not.toContain(omittedTail);
	});

	test("invalid normalized slug output fails with saved-plan-specific failure text", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "work plan task\n" } });

		const message = expectSavedPlanNoFallback(
			await deriveSavedPlanContentSlug(slugContext(pi), {
				content: SAVED_PLAN_CONTENT,
				cwd: CWD,
			}),
		);
		expect(message).toContain(
			"Pi slug model output normalized to an invalid saved-plan filename slug.",
		);
		expect(message).toContain("Normalized slug: work-plan-task");
	});
});
