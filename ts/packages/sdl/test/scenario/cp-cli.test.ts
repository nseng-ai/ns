import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { listSdlCommands } from "@sdl/sdl/cli";

import { runFlowCpCommandWithFakes } from "./flow-command-fakes.ts";
import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";

const tempDirs: string[] = [];

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: defaultExecResponses,
		textGenerationResults: () => [{ ok: true, text: defaultCpMessage() }],
	});
}

function defaultExecResponses(): ScriptedExecResponse[] {
	return [];
}

function dirtyCpExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint\n" } },
	];
}

function cleanCpExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
	];
}

function defaultCpMessage(): string {
	return `[cp] Update checkpoint tests

- Add CLI coverage`;
}

function runCpWithFakes(options: Parameters<typeof runFlowCpCommandWithFakes>[0] = {}) {
	return runFlowCpCommandWithFakes(options);
}

async function createExtensionProject(
	extensionFileName: string,
	extensionSource: string,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-extension-project-"));
	tempDirs.push(directory);
	const extensionPath = join(directory, ".sdl", "extensions", extensionFileName);
	mkdirSync(dirname(extensionPath), { recursive: true });
	writeFileSync(extensionPath, extensionSource);
	return directory;
}

async function createLegacyCommandProject(
	commandFileName: string,
	commandSource: string,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-legacy-command-project-"));
	tempDirs.push(directory);
	const commandPath = join(directory, ".sdl", "commands", commandFileName);
	mkdirSync(dirname(commandPath), { recursive: true });
	writeFileSync(commandPath, commandSource);
	return directory;
}

async function createManifestProject(
	manifest: unknown,
	files: Record<string, string>,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-extension-project-"));
	tempDirs.push(directory);
	const packageDir = join(directory, ".sdl", "extensions", "pkg");
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

describe("empty SDL kernel CLI help and parsing", () => {
	test("static command metadata is empty", () => {
		expect(listSdlCommands()).toEqual([]);
	});

	test("top-level help remains available without domain built-ins", async () => {
		const run = runWithFakes({ args: ["--help"] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl");
		expect(help).toContain("Source Development Lifecycle tools.");
		expect(help).not.toContain("changes");
		expect(help).not.toContain("cp");
		expect(help).not.toContain("submit");
		expect(help).not.toContain("regenerate-pr");
		expect(help).toContain("--runtime");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level -h prints help", async () => {
		const run = runWithFakes({ args: ["-h"] });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: sdl");
		expect(run.stdout.join("")).not.toContain("changes");
		expect(run.stdout.join("")).not.toContain("cp");
		expect(run.stdout.join("")).not.toContain("submit");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level --version prints package version", async () => {
		const run = runWithFakes({ args: ["--version"] });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level runtime reports the TypeScript entrypoint", async () => {
		const run = runWithFakes({ args: ["--runtime"] });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			"runtime: typescript\nentry_point: @sdl/sdl bin sdl -> ts/packages/sdl/src/cli.ts\n",
		);
		expect(run.stderr.join("")).toBe("");
	});

	test("removed domain built-ins are unavailable rather than stubbed", async () => {
		for (const commandName of ["flow", "cp", "submit", "regenerate-pr"] as const) {
			const run = runWithFakes({ args: [commandName], state: { exec: [] } });

			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		}
	});
});

describe("sdl extension contribution loading", () => {
	test("project-only direct command summary appears in top-level help", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`
import { defineExtension, ok } from "@sdl/sdl/sdk";

export default defineExtension({
	commands: [{
		name: "hello",
		summary: "Say hello from help.",
		description: "Say hello with details.",
		run() { return ok("hello"); },
	}],
});
`,
		);
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("hello");
		expect(help).toContain("Say hello from help.");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("throwing direct command keeps placeholder in top-level help and warns", async () => {
		const cwd = await createExtensionProject("hello.ts", "throw new Error('module boom');\n");
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("hello");
		expect(help).toContain("Run SDL command entry 'hello'.");
		expect(run.stderr.join("")).toContain("Warning:");
		expect(run.stderr.join("")).toContain("module boom");
		expect(run.context.execCalls).toEqual([]);
	});

	test("manifest metadata appears in top-level help without importing the entry", async () => {
		const cwd = await createManifestProject(
			{
				sdl: {
					commands: [
						{
							name: "hello",
							description: "Say hello.",
							fullDescription: "Say hello with details.",
							entry: "./src/hello.ts",
						},
					],
				},
			},
			{ "src/hello.ts": "throw new Error('should not import during help');\n" },
		);
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("hello");
		expect(help).toContain("Say hello.");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-local cp help uses selected command metadata and schema", async () => {
		const cwd = await createExtensionProject(
			"cp.ts",
			`
import { defineExtension, ok, z } from "@sdl/sdl/sdk";

export default defineExtension({
	commands: [{
	name: "cp",
	summary: "Project cp override.",
	description: "Project cp override with options.",
	schema: z.object({ dryRun: z.boolean().default(false).describe("Preview the override.") }),
	run() { return ok("unused"); },
}],
});
`,
		);
		const run = runWithFakes({ args: ["cp", "--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl cp");
		expect(help).toContain("Project cp override with options.");
		expect(help).toContain("--dry-run");
		expect(help).not.toContain("model-authored");
		expect(help).not.toContain("SDL_CHECKPOINT_MODEL");
		expect(help).not.toContain("SDL_DEV_CHECKPOINT_MODEL");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-only SDL command entry runs when invoked", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`
import { defineExtension, ok } from "@sdl/sdl/sdk";

export default defineExtension({
	commands: [{
	name: "hello",
	summary: "Say hello.",
	description: "Say hello",
	async run(ctx) {
		const result = await ctx.exec("echo", ["hello"]);
		return ok(result.stdout.trim());
	},
}],
});
`,
		);
		const run = runWithFakes({
			args: ["hello"],
			state: { exec: [{ match: "echo hello", result: { stdout: "hello\n" } }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("hello\n");
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual(["echo hello"]);
	});

	test("selected SDL command entry help schema and invocation use the loaded request schema", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`
import { defineExtension, ok, z } from "@sdl/sdl/sdk";

export default defineExtension({
	commands: [{
	name: "hello",
	summary: "Say hello.",
	description: "Say hello with options.",
	schema: z.object({ loud: z.boolean().default(false).describe("Use loud output.") }),
	run(_ctx, request) {
		return ok(request.loud ? "HELLO" : "hello");
	},
}],
});
`,
		);

		const helpRun = runWithFakes({ args: ["hello", "--help"], state: { exec: [] }, cwd });
		expect(await helpRun.exit).toBe(0);
		expect(helpRun.stdout.join("")).toContain("Say hello with options.");
		expect(helpRun.stdout.join("")).toContain("--loud");

		const schemaRun = runWithFakes({ args: ["hello", "--json-schema"], state: { exec: [] }, cwd });
		expect(await schemaRun.exit).toBe(0);
		expect(parseJsonOutput(schemaRun)).toHaveProperty("input_json_schema");

		const invokeRun = runWithFakes({ args: ["hello", "--loud"], state: { exec: [] }, cwd });
		expect(await invokeRun.exit).toBe(0);
		expect(invokeRun.stdout.join("")).toBe("HELLO\n");
		expect(invokeRun.context.execCalls).toEqual([]);
	});

	test("selected extension load failure fails only when that command is selected", async () => {
		const cwd = await createExtensionProject("hello.ts", "throw new Error('module boom');\n");

		const helpRun = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });
		expect(await helpRun.exit).toBe(0);
		expect(helpRun.stderr.join("")).toContain("Warning:");
		expect(helpRun.stderr.join("")).toContain("module boom");

		const selectedRun = runWithFakes({ args: ["hello"], state: { exec: [] }, cwd });
		expect(await selectedRun.exit).toBe(2);
		expect(selectedRun.stdout.join("")).toBe("");
		expect(selectedRun.stderr.join("")).toContain("Failed to load SDL extension contribution");
		expect(selectedRun.stderr.join("")).toContain("module boom");
		expect(selectedRun.context.execCalls).toEqual([]);
	});

	test("invalid inferred SDL command entry name warns during top-level help", async () => {
		const cwd = await createExtensionProject("Bad.ts", "export default {};\n");
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: sdl");
		expect(run.stderr.join("")).toContain("Warning:");
		expect(run.stderr.join("")).toContain("command entry name inferred");
		expect(run.stderr.join("")).toContain("[a-z][a-z0-9-]*");
		expect(run.context.execCalls).toEqual([]);
	});

	test("malformed unrelated extension warns without breaking static version output", async () => {
		const cwd = await createExtensionProject("Bad.ts", "export default {};\n");
		const run = runWithFakes({ args: ["--version"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toContain("Warning:");
		expect(run.stderr.join("")).toContain("command entry name inferred");
		expect(run.context.execCalls).toEqual([]);
	});

	test("malformed unrelated extension warns without breaking a valid project command", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`
import { defineExtension, ok } from "@sdl/sdl/sdk";
export default defineExtension({
	commands: [{ name: "hello", summary: "Hello", description: "Hello", run() { return ok("hello"); } }],
});
`,
		);
		writeFileSyncWithParents(join(cwd, ".sdl", "extensions", "Bad.ts"), "export default {};\n");
		const run = runWithFakes({ args: ["hello"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("hello\n");
		expect(run.stderr.join("")).toContain("Warning:");
		expect(run.stderr.join("")).toContain("command entry name inferred");
		expect(run.context.execCalls).toEqual([]);
	});

	test("malformed selected manifest command exits with its discovery diagnostic", async () => {
		const cwd = await createManifestProject(
			{ sdl: { commands: [{ name: "hello", description: "Say hello.", entry: "./missing.ts" }] } },
			{},
		);
		const run = runWithFakes({ args: ["hello"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain(
			"Extension manifest command entry does not exist: ./missing.ts",
		);
		expect(run.context.execCalls).toEqual([]);
	});

	test("malformed selected project command fails instead of falling back to a removed built-in", async () => {
		const cwd = await createManifestProject(
			{ sdl: { commands: [{ name: "cp", description: "Broken cp.", entry: "./missing.ts" }] } },
			{},
		);
		const run = runWithFakes({ args: ["flow", "cp"], cwd });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain(
			"Extension manifest command entry does not exist: ./missing.ts",
		);
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("SDL command entry schema must be a Zod object", async () => {
		const cwd = await createExtensionProject(
			"hello.ts",
			`
import { defineExtension } from "@sdl/sdl/sdk";

export default defineExtension({
	commands: [{
		name: "hello",
		summary: "Hello",
		description: "Hello",
		schema: { safeParse() { return { success: true, data: {} }; } },
		run() { return { ok: true, message: "hello" }; },
	}],
});
`,
		);
		const run = runWithFakes({ args: ["hello"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Invalid SDL extension contribution extensions/hello.ts");
		expect(run.stderr.join("")).toContain(
			"command schema must be a Zod object schema from @sdl/sdl/sdk",
		);
		expect(run.context.execCalls).toEqual([]);
	});

	test("declaration extension files are ignored", async () => {
		const cwd = await createExtensionProject("types.d.ts", "export interface Ignored {}\n");
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).not.toContain("types");
		expect(run.stderr.join("")).toBe("");
	});

	test("legacy .sdl/commands files no longer register commands", async () => {
		const cwd = await createLegacyCommandProject(
			"hello.ts",
			`
import { defineExtension, ok } from "@sdl/sdl/sdk";
export default defineExtension({
	commands: [{ name: "hello", summary: "Legacy hello", description: "Legacy hello", run() { return ok("legacy"); } }],
});
`,
		);
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).not.toContain("hello");
		expect(run.stderr.join("")).toBe("");
	});
});

describe("project-local cp extension behavior", () => {
	test("drafts with the model gateway and commits a valid model message", async () => {
		const message = `[cp] Update CLI checkpoint

- Add command table coverage`;
		const run = runCpWithFakes({
			state: {
				textGeneration: [{ ok: true, text: message }],
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{ match: "git add -A", result: {} },
					{ match: /^git commit -F /, result: {} },
					{
						match: "git log -1 --oneline",
						result: { stdout: "def456 [cp] Update CLI checkpoint\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`def456 [cp] Update CLI checkpoint\n${message}\n`);
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
			"git add -A",
			expect.stringMatching(/^git commit -F /),
			"git log -1 --oneline",
		]);
		expect(run.context.textGeneratorCalls).toEqual([
			expect.objectContaining({
				modelRef: "openai-codex/gpt-5.4-mini",
				operation: "checkpoint-message",
				maxTokens: 512,
				reasoning: "low",
			}),
		]);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"## git status --porcelain\n\n M src/app.ts",
		);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"## git diff HEAD\n\ndiff --git a/src/app.ts b/src/app.ts",
		);
	});

	test("dry-run previews the checkpoint without staging, committing, or reading log", async () => {
		const run = runCpWithFakes({ request: { dryRun: true } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			`Dry run: would create checkpoint commit on feature/demo\n\n${defaultCpMessage()}\n`,
		);
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
		expect(formattedExecCalls(run.context)).not.toContain("git add -A");
		expect(formattedExecCalls(run.context)).not.toContain("git log -1 --oneline");
	});

	test("checkpoint model can be selected by SDL environment with legacy fallback", async () => {
		const selected = runCpWithFakes({
			env: {
				SDL_CHECKPOINT_MODEL: "openai-codex/custom-mini",
				SDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy",
			},
		});

		expect(await selected.exit).toBe(0);
		expect(selected.context.textGeneratorCalls[0]?.modelRef).toBe("openai-codex/custom-mini");

		const fallback = runCpWithFakes({
			env: { SDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy-mini" },
		});
		expect(await fallback.exit).toBe(0);
		expect(fallback.context.textGeneratorCalls[0]?.modelRef).toBe("openai-codex/legacy-mini");
	});

	test("model generation error exits 2 without committing", async () => {
		const run = runCpWithFakes({
			state: { textGeneration: [{ ok: false, error: "auth failed" }] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("auth failed\n");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("invalid first model output triggers one repair request and commits the repaired message", async () => {
		const repaired = `[cp] Repair checkpoint message

- Keep only valid bullets`;
		const run = runCpWithFakes({
			state: {
				textGeneration: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: repaired },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.context.textGeneratorCalls).toHaveLength(2);
		expect(run.context.textGeneratorCalls[1]?.prompt).toContain(
			"## previous invalid draft\n\nnot a commit message",
		);
		expect(run.context.textGeneratorCalls[1]?.prompt).toContain("missing_cp_prefix");
		expect(formattedExecCalls(run.context)).toEqual([
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
		const run = runCpWithFakes({
			state: {
				textGeneration: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: "still invalid" },
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain(
			"Model produced an invalid checkpoint message after 2 attempts.",
		);
		expect(run.stderr.join("")).toContain("missing_cp_prefix");
		expect(run.context.textGeneratorCalls).toHaveLength(2);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("clean worktree exits without model generation or committing", async () => {
		const run = runCpWithFakes({
			state: { exec: cleanCpExecResponses() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Working tree is clean; nothing to checkpoint.\n");
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("trunk branch exits before clean-worktree rejection or model generation", async () => {
		const run = runCpWithFakes({
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
		expect(run.stderr.join("")).toBe(
			"Refusing to create checkpoint commit on trunk branch: main\n",
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("snapshot git failures exit with typed diagnostics", async () => {
		const notGit = runCpWithFakes({
			state: {
				exec: [
					{
						match: "git rev-parse --show-toplevel",
						result: { code: 128, stderr: "fatal: not a git repository" },
					},
				],
			},
		});

		expect(await notGit.exit).toBe(2);
		expect(notGit.stderr.join("")).toBe(
			"Not inside a git repository.\nexit 128: fatal: not a git repository\n",
		);
		expect(notGit.context.textGeneratorCalls).toEqual([]);

		const detached = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{
						match: "git symbolic-ref --short HEAD",
						result: { code: 1, stderr: "fatal: ref HEAD is not a symbolic ref" },
					},
				],
			},
		});
		expect(await detached.exit).toBe(2);
		expect(detached.stderr.join("")).toBe(
			"Could not determine current branch.\nexit 1: fatal: ref HEAD is not a symbolic ref\n",
		);

		const statusFailed = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { code: 1, stderr: "index locked" } },
				],
			},
		});
		expect(await statusFailed.exit).toBe(2);
		expect(statusFailed.stderr.join("")).toBe(
			"Could not inspect git status.\nexit 1: index locked\n",
		);

		const diffFailed = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{ match: "git diff HEAD --no-ext-diff", result: { code: 1, stderr: "diff failed" } },
				],
			},
		});
		expect(await diffFailed.exit).toBe(2);
		expect(diffFailed.stderr.join("")).toBe("Could not capture git diff.\nexit 1: diff failed\n");
	});

	test("commit operation failures exit with useful stderr", async () => {
		const addFailed = runCpWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{ match: "git add -A", result: { code: 1, stderr: "index locked" } },
				],
			},
		});

		expect(await addFailed.exit).toBe(2);
		expect(addFailed.stdout.join("")).toBe("");
		expect(addFailed.stderr.join("")).toBe(
			"Failed to stage checkpoint changes.\nexit 1: index locked\n",
		);

		const commitFailed = runCpWithFakes({
			state: {
				exec: [
					...dirtyCpExecResponses().slice(0, 5),
					{ match: /^git commit -F /, result: { code: 1, stderr: "nothing to commit" } },
				],
			},
		});
		expect(await commitFailed.exit).toBe(2);
		expect(commitFailed.stderr.join("")).toBe(
			"Checkpoint commit failed.\nexit 1: nothing to commit\n",
		);

		const logFailed = runCpWithFakes({
			state: {
				exec: [
					...dirtyCpExecResponses().slice(0, 6),
					{ match: "git log -1 --oneline", result: { code: 1, stderr: "log failed" } },
				],
			},
		});
		expect(await logFailed.exit).toBe(2);
		expect(logFailed.stderr.join("")).toBe(
			"Created checkpoint commit, but failed to read it back.\nexit 1: log failed\n",
		);
	});
});
