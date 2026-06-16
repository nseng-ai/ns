import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { GENERATED_BODY_MARKER } from "@asdl/core/submit";
import { runCli } from "@asdl/sdl/cli";
import type { ExecOptions, ExecResult, SdlContext, TextGenerationRequest, TextGenerationResult } from "@asdl/sdl/sdk";

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

const PR_URL = "https://github.com/acme/repo/pull/123";
const generatedText = `Improve PR descriptions

This regenerates the PR title and body with the asdl-owned prompt.

## Key Changes

- Adds title generation
- Adds guarded body updates`;

class ScriptedRegeneratePrContext implements SdlContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: ExecCall[] = [];
	readonly modelCalls: TextGenerationRequest[] = [];
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	private readonly execResponses: ScriptedExecResponse[];
	private readonly modelResults: TextGenerationResult[];

	constructor(state: TestState = {}, options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
		this.cwd = options.cwd ?? "/work";
		this.env = options.env ?? {};
		this.execResponses = [...(state.exec ?? successfulRegeneratePrResponses())];
		this.modelResults = [...(state.textGeneration ?? [{ ok: true, text: generatedText }])];
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
			return this.modelResults.shift() ?? { ok: true, text: generatedText };
		},
	};
}

function runWithFakes(args: readonly string[], state: TestState = {}, options: { env?: Record<string, string | undefined> } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const context = new ScriptedRegeneratePrContext(state, options.env === undefined ? {} : { env: options.env });
	return {
		context,
		stdout,
		stderr,
		exit: runCli(args, {
			context,
			cwd: context.cwd,
			homeDir: join(context.cwd, ".home"),
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

function successfulRegeneratePrResponses(): ScriptedExecResponse[] {
	return [
		{ match: "gh pr view --json number,url,title,body,headRefName,baseRefName", result: { stdout: prJson({ body: `Old body\n${GENERATED_BODY_MARKER}` }) } },
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n+export const value = true;\n" } },
		{ match: /^gh pr edit 123 --title Improve PR descriptions --body-file /, result: {} },
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
	return JSON.stringify({ commits: [{ messageHeadline: "Add regenerate-pr", messageBody: "Body from commit" }] });
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

function formattedExecCalls(context: ScriptedRegeneratePrContext): string[] {
	return context.execCalls.map(formatExecCall);
}

describe("sdl regenerate-pr CLI", () => {
	test("help documents regenerate-pr behavior through clinkr", async () => {
		const run = runWithFakes(["regenerate-pr", "--help"], { exec: [] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl regenerate-pr");
		expect(help).toContain("replacing any existing");
		expect(help).toContain("body. The --force flag");
		expect(help).toContain("ASDL_DEV_PR_DESCRIPTION_MODEL");
		expect(help).toContain("ASDL_DEV_PR_DESCRIPTION_PROMPT");
		expect(help).toContain("--force");
		expect(help).toContain("--json-schema");
		expect(help).not.toContain("\n  --format");
		expect(run.context.execCalls).toEqual([]);
	});

	test("json schema is available without touching GitHub", async () => {
		const run = runWithFakes(["regenerate-pr", "--json-schema"], { exec: [] });

		expect(await run.exit).toBe(0);
		const schema = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(schema).toHaveProperty("input_json_schema");
		expect(schema).toHaveProperty("output_json_schema");
		expect(run.context.execCalls).toEqual([]);
	});

	test("raw regenerate-pr rejects clinkr --format", async () => {
		const run = runWithFakes(["regenerate-pr", "--format", "json"], { exec: [] });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown option '--format'");
		expect(run.context.execCalls).toEqual([]);
	});

	test("regenerates the current branch PR with SDL-owned wording", async () => {
		const run = runWithFakes(["regenerate-pr"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Regenerated PR description.");
		expect(run.stdout.join("")).toContain(`PR: #123 ${PR_URL}`);
		expect(run.stdout.join("")).toContain("Prompt: built-in");
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual(
			expect.arrayContaining([
				"gh pr view --json number,url,title,body,headRefName,baseRefName",
				"gh pr view 123 --json commits",
				"git rev-parse --show-toplevel",
				"gh pr diff 123",
				expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /),
			]),
		);
		expect(run.context.modelCalls[0]).toMatchObject({
			operation: "pr-description",
			modelRef: "openai-codex/gpt-5.4-mini",
			maxTokens: 2048,
			reasoning: "low",
		});
		expect(run.context.modelCalls[0]?.prompt).toContain("## Context");
		expect(run.context.modelCalls[0]?.prompt).toContain("## Diff");
	});

	test("--force remains a compatibility no-op", async () => {
		const run = runWithFakes(["regenerate-pr", "--force"]);

		expect(await run.exit).toBe(0);
		expect(formattedExecCalls(run.context)).toContainEqual(expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /));
	});

	test("reports no current PR clearly", async () => {
		const run = runWithFakes(["regenerate-pr"], {
			exec: [{ match: "gh pr view --json number,url,title,body,headRefName,baseRefName", result: { code: 1, stderr: "no pull requests found for branch\n" } }],
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Could not resolve current branch PR");
		expect(run.context.execCalls).toHaveLength(1);
	});

	test("uses the historical PR description model environment override", async () => {
		const run = runWithFakes(["regenerate-pr"], {}, { env: { ASDL_DEV_PR_DESCRIPTION_MODEL: "openai-codex/custom-mini" } });

		expect(await run.exit).toBe(0);
		expect(run.context.modelCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
	});

	test("reports the historical env prompt path in success output", async () => {
		const promptPath = join(tmpdir(), `sdl-regenerate-pr-prompt-${randomUUID()}.md`);
		await writeFile(promptPath, "custom system prompt", "utf8");
		try {
			const run = runWithFakes(["regenerate-pr"], {}, { env: { ASDL_DEV_PR_DESCRIPTION_PROMPT: promptPath } });

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain(`Prompt: ${promptPath}`);
			expect(run.context.modelCalls[0]?.system).toBe("custom system prompt");
		} finally {
			await rm(promptPath, { force: true });
		}
	});

	test("unreadable prompt env path exits 2", async () => {
		const run = runWithFakes(["regenerate-pr"], {}, { env: { ASDL_DEV_PR_DESCRIPTION_PROMPT: "/path/that/does/not/exist.md" } });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Could not read ASDL_DEV_PR_DESCRIPTION_PROMPT");
	});

	test("unknown options exit 2", async () => {
		const run = runWithFakes(["regenerate-pr", "--bogus"], { exec: [] });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown option '--bogus'");
		expect(run.stderr.join("")).not.toContain("Usage: sdl regenerate-pr");
		expect(run.context.execCalls).toEqual([]);
	});
});
