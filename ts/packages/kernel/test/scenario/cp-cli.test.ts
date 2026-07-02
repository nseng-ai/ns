import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { listSdlCommands } from "@sdl/kernel/cli";

import {
	runCliWithFakes,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";

const tempDirs: string[] = [];

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: defaultExecResponses,
		textGenerationResults: () => [],
	});
}

function defaultExecResponses(): ScriptedExecResponse[] {
	return [];
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
			"runtime: typescript\nentry_point: @sdl/kernel bin sdl -> ts/packages/kernel/src/cli/index.ts\n",
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

describe("sdl extension discovery without dynamic imports", () => {
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
import { defineExtension, ok } from "@sdl/kernel/sdk";
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
