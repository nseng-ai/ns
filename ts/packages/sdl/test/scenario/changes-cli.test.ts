import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { listSdlCommands, runCli } from "@asdl/sdl/cli";
import type { ExecOptions, ExecResult, SdlContext, TextGenerationRequest, TextGenerationResult } from "@asdl/sdl/sdk";

import { formatOutstandingChangesMessage } from "../../src/changes-summary.ts";
import { validateChangesSummary } from "../../src/changes-model-summary.ts";
import type { PendingWorktreeSnapshot } from "../../src/pending-worktree.ts";

interface ScriptedExecResponse {
	match: string | RegExp | ((call: ExecCall) => boolean);
	result: Partial<ExecResult>;
}

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

interface TestState {
	exec?: readonly ScriptedExecResponse[];
	textGeneration?: readonly TextGenerationResult[];
}

class ScriptedChangesContext implements SdlContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: ExecCall[] = [];
	readonly modelCalls: TextGenerationRequest[] = [];
	private readonly execResponses: ScriptedExecResponse[];
	private readonly modelResults: TextGenerationResult[];

	constructor(state: TestState = {}, options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
		this.cwd = options.cwd ?? "/work";
		this.env = options.env ?? {};
		this.execResponses = [...(state.exec ?? dirtySnapshotResponses())];
		this.modelResults = [...(state.textGeneration ?? [{ ok: true, text: "- Update app behavior\n- Add notes for reviewers" }])];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		const call = { command, args: [...args], options };
		this.execCalls.push(call);
		const index = this.execResponses.findIndex((response) => responseMatches(response.match, call));
		if (index === -1) {
			return execResult({ code: 99, stderr: `unexpected command: ${formatExecCall(call)}` });
		}
		const [response] = this.execResponses.splice(index, 1);
		if (response === undefined) {
			return execResult({ code: 99, stderr: `missing command response: ${formatExecCall(call)}` });
		}
		return execResult(response.result);
	}

	readonly model = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			this.modelCalls.push({ ...request });
			return this.modelResults.shift() ?? { ok: false, error: "missing scripted text result" };
		},
	};
}

function runWithFakes(args: readonly string[], state: TestState = {}, options: { cwd?: string; env?: Record<string, string | undefined>; homeDir?: string } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const context = new ScriptedChangesContext(state, options);
	return {
		context,
		stdout,
		stderr,
		exit: runCli(args, {
			context,
			cwd: context.cwd,
			homeDir: options.homeDir ?? join(context.cwd, ".home"),
			env: context.env,
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
		}),
	};
}

function dirtySnapshotResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
	];
}

function cleanSnapshotResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
	];
}

function execResult(result: Partial<ExecResult> = {}): ExecResult {
	return {
		code: result.code ?? 0,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		killed: result.killed ?? false,
	};
}

function responseMatches(match: ScriptedExecResponse["match"], call: ExecCall): boolean {
	const display = formatExecCall(call);
	if (typeof match === "string") return match === display;
	if (match instanceof RegExp) return match.test(display);
	return match(call);
}

function formatExecCall(call: ExecCall): string {
	return [call.command, ...call.args].join(" ");
}

function formattedExecCalls(context: ScriptedChangesContext): string[] {
	return context.execCalls.map(formatExecCall);
}

function parseJsonOutput(run: { stdout: string[] }): Record<string, unknown> {
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected JSON object output.");
	}
	return value as Record<string, unknown>;
}

describe("sdl changes CLI", () => {
	test("command metadata and help list changes", async () => {
		expect(listSdlCommands()).toEqual([
			{ name: "changes", description: "Summarize outstanding worktree changes without committing." },
			{ name: "cp", description: "Create a checkpoint commit for the current diff." },
			{
				name: "submit",
				description: "Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
			},
		]);

		const topHelp = runWithFakes(["--help"], { exec: [] });
		expect(await topHelp.exit).toBe(0);
		expect(topHelp.stdout.join("")).toContain("changes");
		expect(topHelp.stderr.join("")).toBe("");

		const commandHelp = runWithFakes(["changes", "--help"], { exec: [] });
		expect(await commandHelp.exit).toBe(0);
		const help = commandHelp.stdout.join("");
		expect(help).toContain("Usage: sdl changes");
		expect(help).toContain("read-only git commands");
		expect(help).toContain("SDL_CHANGES_MODEL");
		expect(help).toContain("PI_DRAFT_MODEL");
		expect(help).not.toContain("--format");

		const schema = runWithFakes(["changes", "--json-schema"], { exec: [] });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("input_json_schema");
	});

	test("clean worktree reports no outstanding changes without model generation", async () => {
		const run = runWithFakes(["changes"], { exec: cleanSnapshotResponses() });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("Working tree is clean; no outstanding changes.\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.modelCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("dirty worktree prints model bullets and raw status without mutation", async () => {
		const run = runWithFakes(["changes"], {
			textGeneration: [{ ok: true, text: "- Update app behavior\n- Add reviewer notes" }],
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Outstanding changes on feature/demo");
		expect(output).toContain("- Update app behavior");
		expect(output).toContain("- Add reviewer notes");
		expect(output).toContain("Files:\n M src/app.ts\n?? notes.md");
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
		expect(formattedExecCalls(run.context).some((call) => /git (add|commit|stash)|^gt |^gh /.test(call))).toBe(false);
		expect(run.context.modelCalls).toEqual([
			expect.objectContaining({
				modelRef: "openai-codex/gpt-5.4-mini",
				operation: "changes-summary",
				maxTokens: 512,
				reasoning: "low",
			}),
		]);
		expect(run.context.modelCalls[0]?.prompt).toContain("## branch\n\nfeature/demo");
		expect(run.context.modelCalls[0]?.prompt).toContain("M src/app.ts\n?? notes.md");
		expect(run.context.modelCalls[0]?.prompt).toContain("diff --git a/src/app.ts b/src/app.ts");
	});

	test("changes model can be selected by SDL environment with legacy fallback", async () => {
		const selected = runWithFakes(
			["changes"],
			{ textGeneration: [{ ok: true, text: "- Summarize selected model" }] },
			{ env: { SDL_CHANGES_MODEL: "openai-codex/custom-mini", PI_DRAFT_MODEL: "openai-codex/legacy-mini" } },
		);
		expect(await selected.exit).toBe(0);
		expect(selected.context.modelCalls[0]?.modelRef).toBe("openai-codex/custom-mini");

		const fallback = runWithFakes(
			["changes"],
			{ textGeneration: [{ ok: true, text: "- Summarize fallback model" }] },
			{ env: { PI_DRAFT_MODEL: "openai-codex/legacy-mini" } },
		);
		expect(await fallback.exit).toBe(0);
		expect(fallback.context.modelCalls[0]?.modelRef).toBe("openai-codex/legacy-mini");
	});

	test("model generation and validation failures exit 2 without mutation", async () => {
		const invalid = runWithFakes(["changes"], { textGeneration: [{ ok: true, text: "Summary\n- bullet" }] });
		expect(await invalid.exit).toBe(2);
		expect(invalid.stdout.join("")).toBe("");
		expect(invalid.stderr.join("")).toContain("Model returned an invalid changes summary");
		expect(formattedExecCalls(invalid.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);

		const failed = runWithFakes(["changes"], { textGeneration: [{ ok: false, error: "auth failed" }] });
		expect(await failed.exit).toBe(2);
		expect(failed.stderr.join("")).toBe("auth failed\n");
		expect(formattedExecCalls(failed.context).some((call) => /git (add|commit|stash)|^gt |^gh /.test(call))).toBe(false);
	});

	test("git errors fail with command details", async () => {
		const notGit = runWithFakes(["changes"], {
			exec: [{ match: "git rev-parse --show-toplevel", result: { code: 128, stderr: "fatal: not a git repository" } }],
		});
		expect(await notGit.exit).toBe(2);
		expect(notGit.stderr.join("")).toBe("Not inside a git repository.\nexit 128: fatal: not a git repository\n");
		expect(notGit.context.modelCalls).toEqual([]);

		const statusFailed = runWithFakes(["changes"], {
			exec: [
				{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
				{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
				{ match: "git status --porcelain=v1", result: { code: 1, stderr: "index locked" } },
			],
		});
		expect(await statusFailed.exit).toBe(2);
		expect(statusFailed.stderr.join("")).toBe("Could not inspect git status.\nexit 1: index locked\n");
		expect(statusFailed.context.modelCalls).toEqual([]);
	});
});

describe("changes summary helpers", () => {
	test("validate summary accepts one outer code fence but rejects headers", () => {
		expect(validateChangesSummary("```md\n- Valid bullet\n```")).toEqual({ ok: true, summaryText: "- Valid bullet" });
		expect(validateChangesSummary("Summary\n- Invalid bullet")).toEqual({
			ok: false,
			error: 'Model returned an invalid changes summary (expected 1–4 "- " bullets, no headers or code fences).',
		});
	});

	test("format output caps raw status lines", () => {
		const status = Array.from({ length: 52 }, (_value, index) => ` M file-${index}.ts`).join("\n");
		const snapshot: PendingWorktreeSnapshot = {
			root: "/work",
			branch: "feature/demo",
			status,
			diff: "diff",
			clean: false,
		};

		const output = formatOutstandingChangesMessage({ snapshot, summaryText: "- Update many files" });

		expect(output).toContain("Outstanding changes on feature/demo\n\n- Update many files\n\nFiles:");
		expect(output).toContain(" M file-49.ts");
		expect(output).not.toContain(" M file-50.ts");
		expect(output).toContain("... 2 more file(s)");
	});
});
