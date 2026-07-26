import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { listNsCommands } from "@nseng-ai/sdk/cli";
import { VERSION } from "../../src/cli/index.ts";

import {
	runCliWithFakes,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./ns-cli-fakes.ts";

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
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-project-"));
	tempDirs.push(directory);
	const extensionPath = join(directory, ".ns", "extensions", extensionFileName);
	mkdirSync(dirname(extensionPath), { recursive: true });
	writeFileSync(extensionPath, extensionSource);
	return directory;
}

async function createLegacyCommandProject(
	commandFileName: string,
	commandSource: string,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-legacy-command-project-"));
	tempDirs.push(directory);
	const commandPath = join(directory, ".ns", "commands", commandFileName);
	mkdirSync(dirname(commandPath), { recursive: true });
	writeFileSync(commandPath, commandSource);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("empty ns SDK CLI help and parsing", () => {
	test("static command metadata only includes SDK-owned built-ins", () => {
		expect(listNsCommands()).toEqual([
			{
				name: "point",
				description: "Show one ns point definition and its active source.",
			},
			{
				name: "points",
				description: "List defined ns points and their active sources.",
			},
		]);
	});

	test("top-level help remains available without domain built-ins", async () => {
		const run = runWithFakes({ args: ["--help"] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: ns");
		expect(help).toContain("ns tools.");
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
		expect(run.stdout.join("")).toContain("Usage: ns");
		expect(run.stdout.join("")).not.toContain("changes");
		expect(run.stdout.join("")).not.toContain("cp");
		expect(run.stdout.join("")).not.toContain("submit");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level --version prints package version", async () => {
		const run = runWithFakes({ args: ["--version"] });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`${VERSION}\n`);
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level runtime reports the TypeScript entrypoint", async () => {
		const run = runWithFakes({ args: ["--runtime"] });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			"runtime: typescript\nentry_point: @nseng-ai/sdk bin sdk -> ts/packages/public/sdk/(no package bin)\n",
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

describe("ns extension discovery without dynamic imports", () => {
	test("declaration extension files are ignored", async () => {
		const cwd = await createExtensionProject("types.d.ts", "export interface Ignored {}\n");
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).not.toContain("types");
		expect(run.stderr.join("")).toBe("");
	});

	test("legacy .ns/commands files no longer register commands", async () => {
		const cwd = await createLegacyCommandProject(
			"hello.ts",
			`
import { defineExtension, ok } from "@nseng-ai/sdk";
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
