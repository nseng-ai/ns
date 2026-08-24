const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { derivePlanContentSlug, type PlanContentSlugEvidence } from "../src/core/index.ts";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

type ExitedResult = Extract<ExecResult, { type: "exited" }>;
type ExecResultFixture = Partial<Omit<ExitedResult, "type">> | Exclude<ExecResult, ExitedResult>;

const CWD = "/repo";
const PLAN_CONTENT = "# Add Docs Portal Site\n\nBuild and publish the docs portal.\n";

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class FakeSlugPi implements CommandExecApi {
	readonly calls: ExecCall[] = [];
	private readonly behavior: {
		result?: ExecResultFixture;
		results?: ExecResultFixture[];
		error?: Error;
	};

	constructor(behavior: {
		result?: ExecResultFixture;
		results?: ExecResultFixture[];
		error?: Error;
	}) {
		this.behavior =
			behavior.results === undefined ? behavior : { ...behavior, results: [...behavior.results] };
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
			return {
				type: "exited",
				stdout: `${CWD}\n`,
				stderr: "",
				code: 0,
				signal: null,
			};
		}
		this.calls.push({ command, args: [...args], options });
		if (this.behavior.error !== undefined) {
			throw this.behavior.error;
		}
		const result = this.nextResult();
		if ("type" in result) return result;
		return {
			type: "exited",
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			code: result.code ?? 0,
			signal: result.signal ?? null,
		};
	}

	private nextResult(): ExecResultFixture {
		if (this.behavior.results !== undefined) {
			const result = this.behavior.results.shift();
			if (result === undefined) {
				throw new Error("unexpected extra slug model execution");
			}
			return result;
		}
		return this.behavior.result ?? {};
	}
}

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makePlanFile(
	fileName = "where-would-we-host-mossy-lampson.md",
	content = PLAN_CONTENT,
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "branch-context-plan-content-slug-"));
	tempDirs.push(dir);
	const filePath = join(dir, fileName);
	await writeFile(filePath, content, "utf8");
	return filePath;
}

function expectNoFallback(result: Awaited<ReturnType<typeof derivePlanContentSlug>>): string {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected slug derivation to fail");
	expect(result.error.message).toContain("Failed to derive branch-context slug from plan content.");
	expect(result.error.message).toContain("No filename or deterministic fallback was attempted.");
	return result.error.message;
}

function expectEvidence(result: Awaited<ReturnType<typeof derivePlanContentSlug>>) {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

describe("derivePlanContentSlug", () => {
	test("returns a typed failure when the default plan reader cannot read the file", async () => {
		const filePath = join(tmpdir(), "definitely-missing-branch-context-plan.md");
		const pi = new FakeSlugPi({ result: { stdout: "unexpected-model-call\n" } });

		const result = await derivePlanContentSlug(pi, {
			filePath,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "plan-content-read-failed",
				message: expect.stringContaining(filePath),
			},
		});
		if (result.ok) throw new Error("expected plan content read to fail");
		expect(result.error.message).toContain("ENOENT");
		expect(pi.calls).toEqual([]);
	});

	test("does not relabel an injected reader rejection as a filesystem failure", async () => {
		const pi = new FakeSlugPi({ result: { stdout: "unexpected-model-call\n" } });
		const collaboratorError = new Error("injected reader invariant failed");

		await expect(
			derivePlanContentSlug(pi, {
				filePath: "/injected/reader/path.md",
				cwd: CWD,
				modelSelection: TEST_MODEL_SELECTION,
				readTextFile: async () => {
					throw collaboratorError;
				},
			}),
		).rejects.toBe(collaboratorError);
		expect(pi.calls).toEqual([]);
	});

	test("successful model output becomes a valid slug", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { stdout: "add-docs-portal-site-plan\n" } });

		const result = await derivePlanContentSlug(pi, {
			filePath,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});
		const evidence: PlanContentSlugEvidence = expectEvidence(result);

		expect(evidence).toEqual({
			slug: "add-docs-portal-site",
			rawOutput: "add-docs-portal-site-plan\n",
			provider: TEST_MODEL_SELECTION.provider,
			model: TEST_MODEL_SELECTION.modelId,
		});
		expect(pi.calls).toHaveLength(1);
		expect(pi.calls[0]?.command).toBe("pi");
		expect(pi.calls[0]?.args).toContain(TEST_MODEL_SELECTION.provider);
		expect(pi.calls[0]?.args).toContain(TEST_MODEL_SELECTION.modelId);
		expect(pi.calls[0]?.options).toMatchObject({ cwd: CWD, timeout: 60_000 });
	});

	test("can derive from content supplied by an injected text reader", async () => {
		const filePath = "/does/not/exist/where-would-we-host-mossy-lampson.md";
		const readPaths: string[] = [];
		const pi = new FakeSlugPi({ result: { stdout: "add-docs-portal-site\n" } });

		const evidence = await derivePlanContentSlug(pi, {
			filePath,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
			async readTextFile(path) {
				readPaths.push(path);
				return PLAN_CONTENT;
			},
		});

		expect(expectEvidence(evidence).slug).toBe("add-docs-portal-site");
		expect(readPaths).toEqual([filePath]);
		const prompt = pi.calls[0]?.args.at(-1) ?? "";
		expect(prompt).toContain(PLAN_CONTENT.trim());
		expect(prompt).toContain("Generate the branch-context slug");
		expect(prompt).toContain("Use only the plan content.");
		expect(prompt).toContain("- Use 3–7 words.");
		expect(prompt).toContain("## Plan content");
		expect(prompt).not.toContain(filePath);
		expect(prompt).not.toContain(basename(filePath));
	});

	test("truncates plan content at 32k characters in the private model prompt", async () => {
		const omittedTail = "OMITTED_PLAN_TAIL";
		const filePath = await makePlanFile("large-plan.md", `${"a".repeat(32_100)}${omittedTail}`);
		const pi = new FakeSlugPi({ result: { stdout: "bounded-plan-content\n" } });

		await derivePlanContentSlug(pi, { filePath, cwd: CWD, modelSelection: TEST_MODEL_SELECTION });

		const prompt = pi.calls[0]?.args.at(-1) ?? "";
		expect(prompt).toContain("a".repeat(32_000));
		expect(prompt).toContain("[Plan content truncated for slug generation]");
		expect(prompt).not.toContain(omittedTail);
	});

	test("markdown and code-fenced output is normalized when it yields a valid slug", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({
			result: { stdout: "```markdown\nAdd Docs Portal Site!!!\n```\n" },
		});

		const evidence = await derivePlanContentSlug(pi, {
			filePath,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		expect(expectEvidence(evidence).slug).toBe("add-docs-portal-site");
	});

	test("overlong model output is repaired to seven complete slug words", async () => {
		const filePath = await makePlanFile();
		const rawOutput = "sdl portal pages slot page conventions skeleton theme foundation\n";
		const pi = new FakeSlugPi({ result: { stdout: rawOutput } });

		const evidence = await derivePlanContentSlug(pi, {
			filePath,
			cwd: CWD,
			modelSelection: TEST_MODEL_SELECTION,
		});

		expect(expectEvidence(evidence).slug).toBe("sdl-portal-pages-slot-page-conventions-skeleton");
		expect(expectEvidence(evidence).rawOutput).toBe(rawOutput);
	});

	test("nonzero Pi model command fails with no fallback", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { code: 1, stderr: "model unavailable" } });

		const message = expectNoFallback(
			await derivePlanContentSlug(pi, { filePath, cwd: CWD, modelSelection: TEST_MODEL_SELECTION }),
		);
		expect(message).toContain("model unavailable");
	});

	test("empty model output fails with no fallback", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { stdout: "  \n" } });

		const message = expectNoFallback(
			await derivePlanContentSlug(pi, { filePath, cwd: CWD, modelSelection: TEST_MODEL_SELECTION }),
		);
		expect(message).toContain("empty output");
	});

	test("repeated timed-out Pi model command fails with no fallback after one retry", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({
			results: [
				{ type: "timed-out", stdout: "", stderr: "", code: 143, signal: "SIGTERM" },
				{ type: "timed-out", stdout: "", stderr: "", code: 143, signal: "SIGTERM" },
			],
		});

		const message = expectNoFallback(
			await derivePlanContentSlug(pi, { filePath, cwd: CWD, modelSelection: TEST_MODEL_SELECTION }),
		);
		expect(message).toContain("Pi model command failed (timed out; signal SIGTERM).");
		expect(pi.calls).toHaveLength(2);
	});

	test("invalid normalized slug output fails with no fallback", async () => {
		const filePath = await makePlanFile();
		const pi = new FakeSlugPi({ result: { stdout: "work plan task\n" } });

		const message = expectNoFallback(
			await derivePlanContentSlug(pi, { filePath, cwd: CWD, modelSelection: TEST_MODEL_SELECTION }),
		);
		expect(message).toContain("Normalized slug: work-plan-task");
	});

	test("prompt does not include the source file path or filename", async () => {
		const filePath = await makePlanFile("where-would-we-host-mossy-lampson.md", PLAN_CONTENT);
		const pi = new FakeSlugPi({ result: { stdout: "add-docs-portal-site\n" } });

		await derivePlanContentSlug(pi, { filePath, cwd: CWD, modelSelection: TEST_MODEL_SELECTION });

		const prompt = pi.calls[0]?.args.at(-1) ?? "";
		expect(prompt).toContain("Generate the branch-context slug");
		expect(prompt).toContain(PLAN_CONTENT.trim());
		expect(prompt).not.toContain(filePath);
		expect(prompt).not.toContain(basename(filePath));
	});
});
