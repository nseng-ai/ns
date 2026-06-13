import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { listSdlCommands, runCli } from "@asdl/sdl/cli";
import type { ExecOptions, ExecResult, SdlContext } from "@asdl/sdl/sdk";
import type { TextGenerationRequest, TextGenerationResult } from "@asdl/sdl/text-generation";

interface ScriptedExecResponse {
	match: string | RegExp | ((command: string) => boolean);
	result: Partial<ExecResult>;
}

interface ExecCall {
	command: string;
	options: ExecOptions | undefined;
}

interface TestState {
	exec?: readonly ScriptedExecResponse[];
	textGeneration?: { results?: readonly TextGenerationResult[] };
}

const tempDirs: string[] = [];

class ScriptedSdlContext implements SdlContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: ExecCall[] = [];
	readonly modelCalls: TextGenerationRequest[] = [];
	private readonly execResponses: ScriptedExecResponse[];
	private readonly modelResults: TextGenerationResult[];

	constructor(state: TestState = {}, options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
		this.cwd = options.cwd ?? "/work";
		this.env = options.env ?? {};
		this.execResponses = [...(state.exec ?? defaultSuccessfulExecResponses())];
		this.modelResults = [...(state.textGeneration?.results ?? [{ ok: true, text: defaultCheckpointMessage() }])];
	}

	async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, options });
		const index = this.execResponses.findIndex((response) => responseMatches(response.match, command));
		if (index === -1) {
			return execResult({ code: 99, stderr: `unexpected command: ${command}` });
		}
		const [response] = this.execResponses.splice(index, 1);
		if (response === undefined) {
			return execResult({ code: 99, stderr: `missing command response: ${command}` });
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

function runWithFakes(args: readonly string[], state: TestState = {}, options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const context = new ScriptedSdlContext(state, options);
	return {
		context,
		stdout,
		stderr,
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
		}),
	};
}

function defaultSuccessfulExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git branch --show-current", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain", result: { stdout: " M src/app.ts\n" } },
		{ match: "git diff HEAD", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint tests\n" } },
	];
}

function defaultCheckpointMessage(): string {
	return `[cp] Update checkpoint tests

- Add CLI coverage`;
}

function execResult(result: Partial<ExecResult> = {}): ExecResult {
	return {
		code: result.code ?? 0,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		killed: result.killed ?? false,
	};
}

function responseMatches(match: ScriptedExecResponse["match"], command: string): boolean {
	if (typeof match === "string") return match === command;
	if (match instanceof RegExp) return match.test(command);
	return match(command);
}

function parseJsonOutput(run: { stdout: string[] }): Record<string, unknown> {
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected JSON object output.");
	}
	return value as Record<string, unknown>;
}

async function createOverrideProject(commandSource: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-cp-override-"));
	tempDirs.push(directory);
	const commandPath = join(directory, ".asdl", "commands", "cp.ts");
	mkdirSync(dirname(commandPath), { recursive: true });
	writeFileSync(commandPath, commandSource);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl cp CLI help and parsing", () => {
	test("command metadata lists cp", () => {
		expect(listSdlCommands()).toEqual([{ name: "cp", description: "Create a checkpoint commit for the current diff." }]);
	});

	test("top-level help lists cp", async () => {
		const run = runWithFakes(["--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl");
		expect(help).toContain("Source Development Lifecycle tools.");
		expect(help).toContain("cp");
		expect(help).toContain("--runtime");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level -h prints help", async () => {
		const run = runWithFakes(["-h"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: sdl");
		expect(run.stdout.join("")).toContain("cp");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level --version prints package version", async () => {
		const run = runWithFakes(["--version"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level runtime reports the TypeScript entrypoint", async () => {
		const run = runWithFakes(["--runtime"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("runtime: typescript\nentry_point: @asdl/sdl bin sdl -> ts/packages/sdl/src/cli.ts\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("command help documents checkpoint behavior", async () => {
		const run = runWithFakes(["cp", "--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl cp");
		expect(help).toContain("model-authored");
		expect(help).toContain("SDL_CHECKPOINT_MODEL");
		expect(help).toContain("ASDL_DEV_CHECKPOINT_MODEL");
		expect(help).not.toContain("SDL_TEXT_BACKEND");
		expect(help).not.toContain("ASDL_DEV_TEXT_BACKEND");
		expect(help).toContain("--json-schema");
		expect(help).not.toContain("--format");
	});

	test("raw cp exposes json schema", async () => {
		const run = runWithFakes(["cp", "--json-schema"]);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toHaveProperty("input_json_schema");
		expect(run.stderr.join("")).toBe("");
	});
});

describe("sdl cp CLI behavior", () => {
	test("drafts with the model gateway and commits a valid model message", async () => {
		const message = `[cp] Update CLI checkpoint

- Add command table coverage`;
		const run = runWithFakes(["cp"], {
			textGeneration: { results: [{ ok: true, text: message }] },
			exec: [
				{ match: "git branch --show-current", result: { stdout: "feature/demo\n" } },
				{ match: "git status --porcelain", result: { stdout: " M src/app.ts\n" } },
				{ match: "git diff HEAD", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
				{ match: "git add -A", result: {} },
				{ match: /^git commit -F /, result: {} },
				{ match: "git log -1 --oneline", result: { stdout: "def456 [cp] Update CLI checkpoint\n" } },
			],
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`def456 [cp] Update CLI checkpoint\n${message}\n`);
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.map((call) => call.command)).toEqual([
			"git branch --show-current",
			"git status --porcelain",
			"git diff HEAD",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
		]);
		expect(run.context.modelCalls).toEqual([
			expect.objectContaining({
				modelRef: "openai-codex/gpt-5.4-mini",
				operation: "checkpoint-message",
				maxTokens: 512,
				reasoning: "low",
			}),
		]);
		expect(run.context.modelCalls[0]?.prompt).toContain("## git status --porcelain\n\n M src/app.ts");
		expect(run.context.modelCalls[0]?.prompt).toContain("## git diff HEAD\n\ndiff --git a/src/app.ts b/src/app.ts");
	});

	test("checkpoint model can be selected by SDL environment", async () => {
		const run = runWithFakes(
			["cp"],
			{ textGeneration: { results: [{ ok: true, text: defaultCheckpointMessage() }] } },
			{ env: { SDL_CHECKPOINT_MODEL: "openai-codex/custom-mini", ASDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy" } },
		);

		expect(await run.exit).toBe(0);
		expect(run.context.modelCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
	});

	test("legacy checkpoint model environment is a fallback", async () => {
		const run = runWithFakes(["cp"], {}, { env: { ASDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy-mini" } });

		expect(await run.exit).toBe(0);
		expect(run.context.modelCalls[0]?.modelRef).toBe("openai-codex/legacy-mini");
	});

	test("model generation error exits 2 without committing", async () => {
		const run = runWithFakes(["cp"], {
			textGeneration: { results: [{ ok: false, error: "auth failed" }] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("auth failed\n");
		expect(run.context.modelCalls).toHaveLength(1);
		expect(run.context.execCalls.map((call) => call.command)).toEqual(["git branch --show-current", "git status --porcelain", "git diff HEAD"]);
	});

	test("invalid first model output triggers one repair request and commits the repaired message", async () => {
		const repaired = `[cp] Repair checkpoint message

- Keep only valid bullets`;
		const run = runWithFakes(["cp"], {
			textGeneration: {
				results: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: repaired },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.context.modelCalls).toHaveLength(2);
		expect(run.context.modelCalls[1]?.prompt).toContain("## previous invalid draft\n\nnot a commit message");
		expect(run.context.modelCalls[1]?.prompt).toContain("missing_cp_prefix");
		expect(run.context.execCalls.map((call) => call.command)).toEqual([
			"git branch --show-current",
			"git status --porcelain",
			"git diff HEAD",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
		]);
	});

	test("invalid first and repaired output exits 2 without committing", async () => {
		const run = runWithFakes(["cp"], {
			textGeneration: {
				results: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: "still invalid" },
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Model produced an invalid checkpoint message after 2 attempts.");
		expect(run.stderr.join("")).toContain("missing_cp_prefix");
		expect(run.context.modelCalls).toHaveLength(2);
		expect(run.context.execCalls.map((call) => call.command)).toEqual(["git branch --show-current", "git status --porcelain", "git diff HEAD"]);
	});

	test("clean worktree exits without model generation or committing", async () => {
		const run = runWithFakes(["cp"], {
			exec: [
				{ match: "git branch --show-current", result: { stdout: "feature/demo\n" } },
				{ match: "git status --porcelain", result: { stdout: "" } },
			],
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Working tree is clean; nothing to checkpoint.\n");
		expect(run.context.modelCalls).toEqual([]);
		expect(run.context.execCalls.map((call) => call.command)).toEqual(["git branch --show-current", "git status --porcelain"]);
	});

	test("trunk branch exits without model generation or committing", async () => {
		const run = runWithFakes(["cp"], {
			exec: [{ match: "git branch --show-current", result: { stdout: "main\n" } }],
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toBe("Refusing to create checkpoint commit on trunk branch: main\n");
		expect(run.context.modelCalls).toEqual([]);
		expect(run.context.execCalls.map((call) => call.command)).toEqual(["git branch --show-current"]);
	});

	test("shell failures map to nonzero exits with useful stderr", async () => {
		const run = runWithFakes(["cp"], {
			exec: [
				{ match: "git branch --show-current", result: { stdout: "feature/demo\n" } },
				{ match: "git status --porcelain", result: { stdout: " M src/app.ts\n" } },
				{ match: "git diff HEAD", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
				{ match: "git add -A", result: { code: 1, stderr: "index locked" } },
			],
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Failed to stage checkpoint changes.\nexit 1: index locked\n");
	});

	test("project-local .asdl command fully replaces default cp behavior", async () => {
		const cwd = await createOverrideProject(`
import { defineCommand, ok } from "@asdl/sdl/sdk";

export default defineCommand({
	name: "cp",
	description: "Custom checkpoint",
	async run(ctx) {
		const result = await ctx.exec("echo custom");
		return ok(` + "`custom:${result.stdout.trim()}`" + `);
	},
});
`);
		const run = runWithFakes(
			["cp"],
			{
				exec: [{ match: "echo custom", result: { stdout: "custom\n" } }],
			},
			{ cwd },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("custom:custom\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.map((call) => call.command)).toEqual(["echo custom"]);
		expect(run.context.modelCalls).toEqual([]);
	});

	test("malformed project-local .asdl command exits 2 with a clear diagnostic", async () => {
		const cwd = await createOverrideProject("export default { name: 'wrong', run() {} };\n");
		const run = runWithFakes(["cp"], { exec: [] }, { cwd });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("command name must be \"cp\"");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.modelCalls).toEqual([]);
	});

	test("project-local .asdl command must declare description", async () => {
		const cwd = await createOverrideProject("export default { name: 'cp', run() { return { ok: true, message: 'custom' }; } };\n");
		const run = runWithFakes(["cp"], { exec: [] }, { cwd });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("command description must be a string");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-local .asdl command invalid return exits 2", async () => {
		const cwd = await createOverrideProject("export default { name: 'cp', description: 'Custom', run() { return undefined; } };\n");
		const run = runWithFakes(["cp"], { exec: [] }, { cwd });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toBe("Command cp returned an invalid result.\n");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-local .asdl command throw exits 2", async () => {
		const cwd = await createOverrideProject("export default { name: 'cp', description: 'Custom', run() { throw new Error('boom'); } };\n");
		const run = runWithFakes(["cp"], { exec: [] }, { cwd });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toBe("Command cp failed.\nboom\n");
		expect(run.context.execCalls).toEqual([]);
	});

	test("cp rejects unsupported arguments", async () => {
		const run = runWithFakes(["cp", "--bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown option");
		expect(run.context.execCalls).toEqual([]);
	});

	test("cp accepts a bare option terminator", async () => {
		const run = runWithFakes(["cp", "--"]);

		expect(await run.exit).toBe(0);
		expect(run.context.execCalls[0]?.command).toBe("git branch --show-current");
	});
});
