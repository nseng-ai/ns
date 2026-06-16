import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { listSdlCommands, runCli } from "@asdl/sdl/cli";
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
	textGeneration?: { results?: readonly TextGenerationResult[] };
}

interface RunWithFakesOptions {
	state?: TestState;
	cwd?: string;
	env?: Record<string, string | undefined>;
	homeDir?: string;
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

function runWithFakes(args: readonly string[], options: RunWithFakesOptions = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const context = new ScriptedSdlContext(options.state, options);
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

function defaultSuccessfulExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
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

function responseMatches(match: ScriptedExecResponse["match"], call: ExecCall): boolean {
	const display = formatExecCall(call);
	if (typeof match === "string") return match === display;
	if (match instanceof RegExp) return match.test(display);
	return match(call);
}

function formatExecCall(call: ExecCall): string {
	return [call.command, ...call.args].join(" ");
}

function parseJsonOutput(run: { stdout: string[] }): Record<string, unknown> {
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected JSON object output.");
	}
	return value as Record<string, unknown>;
}

async function createOverrideProject(extensionSource: string): Promise<string> {
	return createExtensionProject("cp.ts", extensionSource);
}

async function createExtensionProject(extensionFileName: string, extensionSource: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-extension-project-"));
	tempDirs.push(directory);
	const extensionPath = join(directory, ".asdl", "extensions", extensionFileName);
	mkdirSync(dirname(extensionPath), { recursive: true });
	writeFileSync(extensionPath, extensionSource);
	return directory;
}

async function createLegacyCommandProject(commandFileName: string, commandSource: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-legacy-command-project-"));
	tempDirs.push(directory);
	const commandPath = join(directory, ".asdl", "commands", commandFileName);
	mkdirSync(dirname(commandPath), { recursive: true });
	writeFileSync(commandPath, commandSource);
	return directory;
}

async function createManifestProject(manifest: unknown, files: Record<string, string>): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-extension-project-"));
	tempDirs.push(directory);
	const packageDir = join(directory, ".asdl", "extensions", "pkg");
	writeFileSyncWithParents(join(packageDir, "package.json"), JSON.stringify(manifest));
	for (const [relativePath, source] of Object.entries(files)) {
		writeFileSyncWithParents(join(packageDir, relativePath), source);
	}
	return directory;
}

function writeFileSyncWithParents(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl cp CLI help and parsing", () => {
	test("command metadata lists built-in commands", () => {
		expect(listSdlCommands()).toEqual([
			{ name: "changes", description: "Summarize outstanding worktree changes without committing." },
			{ name: "cp", description: "Create a checkpoint commit for the current diff." },
			{
				name: "submit",
				description: "Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
			},
		]);
	});

	test("top-level help lists cp", async () => {
		const run = runWithFakes(["--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl");
		expect(help).toContain("Source Development Lifecycle tools.");
		expect(help).toContain("changes");
		expect(help).toContain("cp");
		expect(help).toContain("submit");
		expect(help).toContain("--runtime");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level -h prints help", async () => {
		const run = runWithFakes(["-h"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: sdl");
		expect(run.stdout.join("")).toContain("changes");
		expect(run.stdout.join("")).toContain("cp");
		expect(run.stdout.join("")).toContain("submit");
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

describe("sdl extension command loading", () => {
	test("project-only direct command appears in top-level help without importing the entry", async () => {
		const cwd = await createExtensionProject("hello.ts", "throw new Error('should not import during help');\n");
		const run = runWithFakes(["--help"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("hello");
		expect(help).toContain("Run SDL extension command 'hello'.");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("manifest metadata appears in top-level help without importing the entry", async () => {
		const cwd = await createManifestProject(
			{ asdl: { commands: [{ name: "hello", description: "Say hello.", fullDescription: "Say hello with details.", entry: "./src/hello.ts" }] } },
			{ "src/hello.ts": "throw new Error('should not import during help');\n" },
		);
		const run = runWithFakes(["--help"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("hello");
		expect(help).toContain("Say hello.");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-local cp help uses selected command metadata and schema", async () => {
		const cwd = await createOverrideProject(`
import { defineCommand, ok, z } from "@asdl/sdl/sdk";

export default defineCommand({
	name: "cp",
	description: "Project cp override with options.",
	schema: z.object({ dryRun: z.boolean().default(false).describe("Preview the override.") }),
	run() { return ok("unused"); },
});
`);
		const run = runWithFakes(["cp", "--help"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl cp");
		expect(help).toContain("Project cp override with options.");
		expect(help).toContain("--dryRun");
		expect(help).not.toContain("model-authored");
		expect(help).not.toContain("SDL_CHECKPOINT_MODEL");
		expect(help).not.toContain("ASDL_DEV_CHECKPOINT_MODEL");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-only extension command runs when invoked", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`
import { defineCommand, ok } from "@asdl/sdl/sdk";

export default defineCommand({
	name: "hello",
	description: "Say hello",
	async run(ctx) {
		const result = await ctx.exec("echo", ["hello"]);
		return ok(result.stdout.trim());
	},
});
`,
		);
		const run = runWithFakes(["hello"], { state: { exec: [{ match: "echo hello", result: { stdout: "hello\n" } }] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("hello\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.map(formatExecCall)).toEqual(["echo hello"]);
	});

	test("selected extension command help schema and invocation use the loaded request schema", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`
import { defineCommand, ok, z } from "@asdl/sdl/sdk";

export default defineCommand({
	name: "hello",
	description: "Say hello with options.",
	schema: z.object({ loud: z.boolean().default(false).describe("Use loud output.") }),
	run(_ctx, request) {
		return ok(request.loud ? "HELLO" : "hello");
	},
});
`,
		);

		const helpRun = runWithFakes(["hello", "--help"], { state: { exec: [] }, cwd });
		expect(await helpRun.exit).toBe(0);
		expect(helpRun.stdout.join("")).toContain("Say hello with options.");
		expect(helpRun.stdout.join("")).toContain("--loud");

		const schemaRun = runWithFakes(["hello", "--json-schema"], { state: { exec: [] }, cwd });
		expect(await schemaRun.exit).toBe(0);
		expect(parseJsonOutput(schemaRun)).toHaveProperty("input_json_schema");

		const invokeRun = runWithFakes(["hello", "--loud"], { state: { exec: [] }, cwd });
		expect(await invokeRun.exit).toBe(0);
		expect(invokeRun.stdout.join("")).toBe("HELLO\n");
		expect(invokeRun.context.execCalls).toEqual([]);
	});

	test("selected extension load failure fails only when that command is selected", async () => {
		const cwd = await createExtensionProject("hello.ts", "throw new Error('module boom');\n");

		const helpRun = runWithFakes(["--help"], { state: { exec: [] }, cwd });
		expect(await helpRun.exit).toBe(0);
		expect(helpRun.stderr.join("")).toBe("");

		const selectedRun = runWithFakes(["hello"], { state: { exec: [] }, cwd });
		expect(await selectedRun.exit).toBe(2);
		expect(selectedRun.stdout.join("")).toBe("");
		expect(selectedRun.stderr.join("")).toContain("Failed to load SDL command entry");
		expect(selectedRun.stderr.join("")).toContain("module boom");
		expect(selectedRun.context.execCalls).toEqual([]);
	});

	test("invalid inferred extension command name fails clearly during discovery", async () => {
		const cwd = await createExtensionProject("Bad.ts", "export default {};\n");
		const run = runWithFakes(["--help"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("command name inferred");
		expect(run.stderr.join("")).toContain("[a-z][a-z0-9-]*");
		expect(run.context.execCalls).toEqual([]);
	});

	test("extension command schema must be a Zod object", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`
export default { name: "hello", description: "Hello", schema: { safeParse() { return { success: true, data: {} }; } }, run() { return { ok: true, message: "hello" }; } };
`,
		);
		const run = runWithFakes(["hello"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Invalid extensions/hello.ts");
		expect(run.stderr.join("")).toContain("command schema must be a Zod object schema from @asdl/sdl/sdk");
		expect(run.context.execCalls).toEqual([]);
	});

	test("declaration extension files are ignored", async () => {
		const cwd = await createExtensionProject("types.d.ts", "export interface Ignored {}\n");
		const run = runWithFakes(["--help"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).not.toContain("types");
		expect(run.stderr.join("")).toBe("");
	});

	test("legacy .asdl/commands files no longer register commands", async () => {
		const cwd = await createLegacyCommandProject(
			"hello.ts",
			`
import { defineCommand, ok } from "@asdl/sdl/sdk";
export default defineCommand({ name: "hello", description: "Legacy hello", run() { return ok("legacy"); } });
`,
		);
		const run = runWithFakes(["--help"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).not.toContain("hello");
		expect(run.stderr.join("")).toBe("");
	});
});

describe("sdl cp CLI behavior", () => {
	test("drafts with the model gateway and commits a valid model message", async () => {
		const message = `[cp] Update CLI checkpoint

- Add command table coverage`;
		const run = runWithFakes(["cp"], {
			state: {
				textGeneration: { results: [{ ok: true, text: message }] },
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{ match: "git add -A", result: {} },
					{ match: /^git commit -F /, result: {} },
					{ match: "git log -1 --oneline", result: { stdout: "def456 [cp] Update CLI checkpoint\n" } },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`def456 [cp] Update CLI checkpoint\n${message}\n`);
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.map(formatExecCall)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
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
		const run = runWithFakes(["cp"], {
			state: { textGeneration: { results: [{ ok: true, text: defaultCheckpointMessage() }] } },
			env: { SDL_CHECKPOINT_MODEL: "openai-codex/custom-mini", ASDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy" },
		});

		expect(await run.exit).toBe(0);
		expect(run.context.modelCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
	});

	test("legacy checkpoint model environment is a fallback", async () => {
		const run = runWithFakes(["cp"], { env: { ASDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy-mini" } });

		expect(await run.exit).toBe(0);
		expect(run.context.modelCalls[0]?.modelRef).toBe("openai-codex/legacy-mini");
	});

	test("model generation error exits 2 without committing", async () => {
		const run = runWithFakes(["cp"], {
			state: { textGeneration: { results: [{ ok: false, error: "auth failed" }] } },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("auth failed\n");
		expect(run.context.modelCalls).toHaveLength(1);
		expect(run.context.execCalls.map(formatExecCall)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("invalid first model output triggers one repair request and commits the repaired message", async () => {
		const repaired = `[cp] Repair checkpoint message

- Keep only valid bullets`;
		const run = runWithFakes(["cp"], {
			state: {
				textGeneration: {
					results: [
						{ ok: true, text: "not a commit message" },
						{ ok: true, text: repaired },
					],
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.context.modelCalls).toHaveLength(2);
		expect(run.context.modelCalls[1]?.prompt).toContain("## previous invalid draft\n\nnot a commit message");
		expect(run.context.modelCalls[1]?.prompt).toContain("missing_cp_prefix");
		expect(run.context.execCalls.map(formatExecCall)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
		]);
	});

	test("invalid first and repaired output exits 2 without committing", async () => {
		const run = runWithFakes(["cp"], {
			state: {
				textGeneration: {
					results: [
						{ ok: true, text: "not a commit message" },
						{ ok: true, text: "still invalid" },
					],
				},
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Model produced an invalid checkpoint message after 2 attempts.");
		expect(run.stderr.join("")).toContain("missing_cp_prefix");
		expect(run.context.modelCalls).toHaveLength(2);
		expect(run.context.execCalls.map(formatExecCall)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("clean worktree exits without model generation or committing", async () => {
		const run = runWithFakes(["cp"], {
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: "" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Working tree is clean; nothing to checkpoint.\n");
		expect(run.context.modelCalls).toEqual([]);
		expect(run.context.execCalls.map(formatExecCall)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("trunk branch exits without model generation or committing", async () => {
		const run = runWithFakes(["cp"], {
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "main\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: "" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toBe("Refusing to create checkpoint commit on trunk branch: main\n");
		expect(run.context.modelCalls).toEqual([]);
		expect(run.context.execCalls.map(formatExecCall)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("not-git repositories exit with a typed diagnostic", async () => {
		const run = runWithFakes(["cp"], {
			state: { exec: [{ match: "git rev-parse --show-toplevel", result: { code: 128, stderr: "fatal: not a git repository" } }] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Not inside a git repository.\nexit 128: fatal: not a git repository\n");
		expect(run.context.modelCalls).toEqual([]);
		expect(run.context.execCalls.map(formatExecCall)).toEqual(["git rev-parse --show-toplevel"]);
	});

	test("detached HEAD exits with a typed diagnostic", async () => {
		const run = runWithFakes(["cp"], {
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { code: 1, stderr: "fatal: ref HEAD is not a symbolic ref" } },
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Could not determine current branch.\nexit 1: fatal: ref HEAD is not a symbolic ref\n");
		expect(run.context.modelCalls).toEqual([]);
		expect(run.context.execCalls.map(formatExecCall)).toEqual(["git rev-parse --show-toplevel", "git symbolic-ref --short HEAD"]);
	});

	test("git failures map to nonzero exits with useful stderr", async () => {
		const run = runWithFakes(["cp"], {
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{ match: "git add -A", result: { code: 1, stderr: "index locked" } },
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Failed to stage checkpoint changes.\nexit 1: index locked\n");
	});

	test("project-local extension command fully replaces default cp behavior", async () => {
		const cwd = await createOverrideProject(`
import { defineCommand, ok } from "@asdl/sdl/sdk";

export default defineCommand({
	name: "cp",
	description: "Custom checkpoint",
	async run(ctx) {
		const result = await ctx.exec("echo", ["custom"]);
		return ok(` + "`custom:${result.stdout.trim()}`" + `);
	},
});
`);
		const run = runWithFakes(["cp"], {
			state: { exec: [{ match: "echo custom", result: { stdout: "custom\n" } }] },
			cwd,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("custom:custom\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.map(formatExecCall)).toEqual(["echo custom"]);
		expect(run.context.modelCalls).toEqual([]);
	});

	test("malformed project-local extension command exits 2 with a clear diagnostic", async () => {
		const cwd = await createOverrideProject("export default { name: 'Bad', run() {} };\n");
		const run = runWithFakes(["cp"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain('command name must be "cp"');
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.modelCalls).toEqual([]);
	});

	test("project-local extension command must declare description", async () => {
		const cwd = await createOverrideProject("export default { name: 'cp', run() { return { ok: true, message: 'custom' }; } };\n");
		const run = runWithFakes(["cp"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("command description must be a string");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-local extension command invalid return exits 2", async () => {
		const cwd = await createOverrideProject("export default { name: 'cp', description: 'Custom', run() { return undefined; } };\n");
		const run = runWithFakes(["cp"], { state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toBe("Command cp returned an invalid result.\n");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-local extension command throw exits 2", async () => {
		const cwd = await createOverrideProject("export default { name: 'cp', description: 'Custom', run() { throw new Error('boom'); } };\n");
		const run = runWithFakes(["cp"], { state: { exec: [] }, cwd });

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
		expect((run.context.execCalls[0] === undefined ? undefined : formatExecCall(run.context.execCalls[0]))).toBe("git rev-parse --show-toplevel");
	});
});
