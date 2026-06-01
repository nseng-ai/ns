import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { buildPlanContentSlugPrompt, derivePlanContentSlug } from "../src/planned-branch/plan-content-slug.ts";
import type { ExecResult } from "../src/command-runtime.ts";
import type { ExecOptions, PlanCommandExecApi } from "../src/planned-branch/plan-persistence.ts";

const CWD = "/repo";
const PLAN_CONTENT = "# Add Docs Portal Site\n\nBuild and publish the docs portal.\n";

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class FakeSlugPi implements PlanCommandExecApi {
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

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makePlanFile(fileName = "where-would-we-host-mossy-lampson.md", content = PLAN_CONTENT): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "plan-content-slug-"));
	tempDirs.push(dir);
	const filePath = join(dir, fileName);
	await writeFile(filePath, content, "utf8");
	return filePath;
}

function expectNoFallback(error: unknown): void {
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toContain("Failed to derive planned-branch slug from plan content.");
	expect((error as Error).message).toContain("No filename or deterministic fallback was attempted.");
}

describe("derivePlanContentSlug", () => {
	test("successful model output becomes a valid slug", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { stdout: "add-docs-portal-site\n" } });

		const evidence = await derivePlanContentSlug(pi, { filePath, cwd: CWD });

		expect(evidence).toEqual({
			slug: "add-docs-portal-site",
			rawOutput: "add-docs-portal-site\n",
			provider: "openai",
			model: "gpt-5.4-nano",
		});
		expect(pi.calls).toHaveLength(1);
		expect(pi.calls[0]?.command).toBe("pi");
		expect(pi.calls[0]?.args.slice(0, -1)).toEqual([
			"--provider",
			"openai",
			"--model",
			"gpt-5.4-nano",
			"--thinking",
			"low",
			"--no-session",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			"--no-tools",
			"--mode",
			"text",
			"--print",
		]);
		expect(pi.calls[0]?.options).toMatchObject({ cwd: CWD, timeout: 60_000 });
	});

	test("markdown and code-fenced output is normalized when it yields a valid slug", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { stdout: "```markdown\nAdd Docs Portal Site!!!\n```\n" } });

		const evidence = await derivePlanContentSlug(pi, { filePath, cwd: CWD });

		expect(evidence.slug).toBe("add-docs-portal-site");
	});

	test("overlong model output is repaired to seven complete slug words", async () => {
		const filePath = await makePlanFile();
		const rawOutput = "asdl docs site slot page conventions skeleton theme foundation\n";
		const pi = new FakeSlugPi({ result: { stdout: rawOutput } });

		const evidence = await derivePlanContentSlug(pi, { filePath, cwd: CWD });

		expect(evidence.slug).toBe("asdl-docs-site-slot-page-conventions-skeleton");
		expect(evidence.rawOutput).toBe(rawOutput);
	});

	test("nonzero Pi model command fails with no fallback", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { code: 1, stderr: "model unavailable" } });

		try {
			await derivePlanContentSlug(pi, { filePath, cwd: CWD });
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("model unavailable");
		}
	});

	test("empty model output fails with no fallback", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { stdout: "  \n" } });

		try {
			await derivePlanContentSlug(pi, { filePath, cwd: CWD });
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("empty output");
		}
	});

	test("invalid normalized slug output fails with no fallback", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { stdout: "work plan task\n" } });

		try {
			await derivePlanContentSlug(pi, { filePath, cwd: CWD });
			throw new Error("expected slug derivation to fail");
		} catch (error) {
			expectNoFallback(error);
			expect((error as Error).message).toContain("Normalized slug: work-plan-task");
		}
	});

	test("prompt does not include the source file path or filename", async () => {
		const filePath = await makePlanFile("where-would-we-host-mossy-lampson.md", PLAN_CONTENT);
		const pi = new FakeSlugPi({ result: { stdout: "add-docs-portal-site\n" } });

		await derivePlanContentSlug(pi, { filePath, cwd: CWD });

		const prompt = pi.calls[0]?.args.at(-1) ?? "";
		expect(prompt).toBe(buildPlanContentSlugPrompt(PLAN_CONTENT));
		expect(prompt).toContain(PLAN_CONTENT.trim());
		expect(prompt).not.toContain(filePath);
		expect(prompt).not.toContain(basename(filePath));
	});
});
