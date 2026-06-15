import { describe, expect, test } from "vitest";

import { runCli } from "@asdl/sdl/cli";
import type { ExecOptions, ExecResult, SdlConfirmPrompt, SdlContext, TextGenerationRequest, TextGenerationResult } from "@asdl/sdl/sdk";

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
	confirm?: SdlConfirmPrompt;
}

const PR_URL = "https://github.com/acme/repo/pull/123";

class ScriptedSubmitContext implements SdlContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: ExecCall[] = [];
	readonly modelCalls: TextGenerationRequest[] = [];
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
	confirm?: SdlConfirmPrompt | undefined;
	private readonly execResponses: ScriptedExecResponse[];
	private readonly modelResults: TextGenerationResult[];

	constructor(state: TestState = {}, options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
		this.cwd = options.cwd ?? "/work";
		this.env = options.env ?? {};
		this.execResponses = [...(state.exec ?? successfulSubmitResponses())];
		this.modelResults = [...(state.textGeneration ?? [])];
		this.confirm = state.confirm;
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
		const result = execResult(response.result);
		options?.onStdout?.(result.stdout);
		options?.onStderr?.(result.stderr);
		return result;
	}

	readonly model = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			this.modelCalls.push({ ...request });
			return this.modelResults.shift() ?? { ok: false, error: "missing scripted text result" };
		},
	};
}

function runWithFakes(args: readonly string[], state: TestState = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
	const context = new ScriptedSubmitContext(state);
	return {
		context,
		stdout,
		stderr,
		liveOutput,
		exit: runCli(args, {
			context,
			cwd: context.cwd,
			env: context.env,
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
			onOutput: (stream, text) => {
				liveOutput.push({ stream, text });
			},
			...(state.confirm === undefined ? {} : { confirm: state.confirm }),
		}),
	};
}

function cleanCheckpointResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
	];
}

function dirtyCheckpointResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Submit checkpoint\n" } },
	];
}

function successfulSubmitResponses(): ScriptedExecResponse[] {
	return [
		...cleanCheckpointResponses(),
		{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run", result: { stdout: "ready\n" } },
		{ match: "gt log --stack --reverse --no-interactive", result: { stdout: "◉ feature/demo (current)\n" } },
		{ match: "gt branch info --no-interactive --branch feature/demo", result: { stdout: `Parent: main\nPR: ${PR_URL}\n` } },
		{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web", result: { stdout: `Submitted ${PR_URL}\n` } },
		{ match: "gt branch info --no-interactive", result: { stdout: `Current PR: ${PR_URL}\n` } },
		{ match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName", result: { stdout: prJson({ body: "Hand edited body" }) } },
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
	];
}

function prJson(options: { body: string; title?: string } = { body: "" }): string {
	return JSON.stringify({
		number: 123,
		url: PR_URL,
		title: options.title ?? "Existing PR title",
		body: options.body,
		headRefName: "feature/demo",
		baseRefName: "main",
	});
}

function commitsJson(): string {
	return JSON.stringify({ commits: [{ messageHeadline: "Add submit", messageBody: "Body from commit" }] });
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

function formattedExecCalls(context: ScriptedSubmitContext): string[] {
	return context.execCalls.map(formatExecCall);
}

describe("sdl submit CLI", () => {
	test("help and schema expose built-in submit without running subprocesses", async () => {
		const helpRun = runWithFakes(["submit", "--help"], { exec: [] });
		expect(await helpRun.exit).toBe(0);
		const help = helpRun.stdout.join("");
		expect(help).toContain("Usage: sdl submit");
		expect(help).toContain("--restack");
		expect(help).toContain("ASDL_DEV_PR_DESCRIPTION_MODEL");
		expect(help).toContain("ASDL_DEV_PR_DESCRIPTION_PROMPT");
		expect(help).not.toContain("\n  --format");
		expect(helpRun.context.execCalls).toEqual([]);

		const schemaRun = runWithFakes(["submit", "--json-schema"], { exec: [] });
		expect(await schemaRun.exit).toBe(0);
		expect(JSON.parse(schemaRun.stdout.join(""))).toHaveProperty("input_json_schema");
		expect(schemaRun.context.execCalls).toEqual([]);
	});

	test("clean success submits, verifies current PR, preserves live output, and skips hand-edited PR bodies", async () => {
		const run = runWithFakes(["submit"]);

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("gt submit succeeded");
		expect(output).toContain(`#123 ${PR_URL}`);
		expect(output).toContain("Skipped PR descriptions (body looks hand-edited)");
		expect(run.stderr.join("")).toBe("");
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				{ stream: "stdout", text: "ready\n" },
				{ stream: "stdout", text: `Submitted ${PR_URL}\n` },
			]),
		);
		expect(formattedExecCalls(run.context)).toContain("gt branch info --no-interactive");
	});

	test("dirty worktree checkpoints before submitting", async () => {
		const run = runWithFakes(["submit"], {
			exec: [...dirtyCheckpointResponses(), ...successfulSubmitResponses().slice(cleanCheckpointResponses().length)],
			textGeneration: [{ ok: true, text: "[cp] Submit checkpoint\n\n- Capture dirty work" }],
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("abc123 [cp] Submit checkpoint");
		expect(formattedExecCalls(run.context)).toEqual(
			expect.arrayContaining(["git add -A", expect.stringMatching(/^git commit -F /), "gt submit -nps --no-ai --no-interactive --no-view --no-web"]),
		);
	});

	test("checkpoint failure aborts before Graphite submit", async () => {
		const run = runWithFakes(["submit"], {
			exec: [
				{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
				{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
				{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
				{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
			],
			textGeneration: [{ ok: false, error: "model unavailable" }],
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Checkpoint before submit failed. Submission was not attempted.");
		expect(run.stderr.join("")).toContain("model unavailable");
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gt submit"))).toBe(false);
	});

	test("restack-required dry-run stops with guidance when no flag or confirmation is available", async () => {
		const run = runWithFakes(["submit"], {
			exec: [
				...cleanCheckpointResponses(),
				{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run", result: { code: 1, stderr: "branch must be restacked before submitting\n" } },
			],
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Graphite requires a restack before submission.");
		expect(formattedExecCalls(run.context)).not.toContain("gt restack --no-interactive");
	});

	test("confirmation threads through SdlContext and runs restack before submit", async () => {
		const confirmations: Array<{ title: string; message: string }> = [];
		const run = runWithFakes(["submit"], {
			exec: [
				...cleanCheckpointResponses(),
				{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run", result: { code: 1, stderr: "restack is required before submit\n" } },
				{ match: "gt restack --no-interactive", result: { stdout: "restacked\n" } },
				...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
			],
			confirm: (title, message) => {
				confirmations.push({ title, message });
				return true;
			},
		});

		expect(await run.exit).toBe(0);
		expect(confirmations[0]?.title).toBe("Run gt restack before submit?");
		expect(confirmations[0]?.message).toContain("gt restack --no-interactive");
		expect(formattedExecCalls(run.context)).toContain("gt restack --no-interactive");
	});

	test("runCli preserves hooks already present on an injected SdlContext", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
		const confirmations: string[] = [];
		const context = new ScriptedSubmitContext({
			exec: [
				...cleanCheckpointResponses(),
				{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run", result: { code: 1, stdout: "restack required before submit\n" } },
				{ match: "gt restack --no-interactive", result: { stdout: "restacked\n" } },
				...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
			],
			confirm: (title) => {
				confirmations.push(title);
				return true;
			},
		});
		context.stdout = (text) => {
			stdout.push(text);
		};
		context.stderr = (text) => {
			stderr.push(text);
		};
		context.onOutput = (stream, text) => {
			liveOutput.push({ stream, text });
		};

		expect(await runCli(["submit"], { context })).toBe(0);
		expect(stdout.join("")).toContain("gt submit succeeded");
		expect(stderr.join("")).toBe("");
		expect(confirmations).toEqual(["Run gt restack before submit?"]);
		expect(liveOutput).toEqual(expect.arrayContaining([{ stream: "stdout", text: "restacked\n" }]));
	});

	test("--restack runs restack without prompting", async () => {
		const run = runWithFakes(["submit", "--restack"], {
			exec: [
				...cleanCheckpointResponses(),
				{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run", result: { code: 1, stderr: "must be restacked before submit\n" } },
				{ match: "gt restack --no-interactive", result: { stdout: "restacked\n" } },
				...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
			],
			confirm: () => {
				throw new Error("confirm should not be called with --restack");
			},
		});

		expect(await run.exit).toBe(0);
		expect(formattedExecCalls(run.context)).toContain("gt restack --no-interactive");
	});

	test("restack conflicts are reported before submit", async () => {
		const run = runWithFakes(["submit", "--restack"], {
			exec: [
				...cleanCheckpointResponses(),
				{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run", result: { code: 1, stderr: "restack required before submit\n" } },
				{ match: "gt restack --no-interactive", result: { code: 1, stderr: "CONFLICT (content): src/app.ts\n" } },
				{ match: "git diff --name-only --diff-filter=U", result: { stdout: "src/app.ts\n" } },
				{ match: "git status --porcelain", result: { stdout: "UU src/app.ts\n" } },
			],
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("`gt restack` hit merge conflicts. Submission was not attempted.");
		expect(run.stderr.join("")).toContain("- src/app.ts");
		expect(formattedExecCalls(run.context).filter((call) => call === "gt submit -nps --no-ai --no-interactive --no-view --no-web")).toEqual([]);
	});

	test("failed submit output gets an optional model interpretation", async () => {
		const run = runWithFakes(["submit", "--restack"], {
			exec: [
				...cleanCheckpointResponses(),
				{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run", result: { code: 1, stderr: "restack required before submit\n" } },
				{ match: "gt restack --no-interactive", result: { stdout: "restacked\n" } },
				{
					match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run",
					result: { code: 1, stderr: "WARNING: You must restack before submitting this stack.\nERROR: Aborting dry run.\n" },
				},
			],
			textGeneration: [{ ok: true, text: "## What happened\nGraphite still thinks the stack is stale.\n\n## Recommended next steps\nRun `gt submit -nps --no-ai --no-interactive --dry-run` and inspect the stack state." }],
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Graphite readiness changed after restack. Submission was not attempted");
		expect(error).toContain("AI interpretation:");
		expect(error).toContain("Graphite still thinks the stack is stale.");
		expect(run.context.modelCalls).toHaveLength(1);
		expect(run.context.modelCalls[0]?.operation).toBe("submit-failure");
		expect(run.context.modelCalls[0]?.prompt).toContain("WARNING: You must restack before submitting this stack.");
	});

	test("description edit failure keeps submitted PR links visible", async () => {
		const run = runWithFakes(["submit"], {
			exec: [
				...cleanCheckpointResponses(),
				{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run", result: { stdout: "ready\n" } },
				{ match: "gt log --stack --reverse --no-interactive", result: { stdout: "◉ feature/demo (current)\n" } },
				{ match: "gt branch info --no-interactive --branch feature/demo", result: { stdout: `Parent: main\nPR: ${PR_URL}\n` } },
				{ match: "gt submit -nps --no-ai --no-interactive --no-view --no-web", result: { stdout: `Submitted ${PR_URL}\n` } },
				{ match: "gt branch info --no-interactive", result: { stdout: `Current PR: ${PR_URL}\n` } },
				{ match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName", result: { stdout: prJson({ body: "" }) } },
				{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
				{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
				{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
				{ match: /^gh pr edit 123 --title Generated PR --body-file /, result: { code: 1, stderr: "edit denied\n" } },
			],
			textGeneration: [{ ok: true, text: "Generated PR\n\nGenerated body" }],
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("PRs were submitted; description generation failed.");
		expect(error).toContain(`#123 ${PR_URL}`);
		expect(error).toContain("Could not update PR #123.");
	});
});
