import { cpSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { listSdlCommands } from "@sdl/kernel/cli";

import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";

const PUSH_TIMEOUT_MS = 120_000;
const tempDirs: string[] = [];

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: () => [],
		textGenerationResults: () => [],
		missingTextGenerationResult: () => ({ ok: false, error: "unexpected model call" }),
	});
}

async function createPushProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-push-extension-project-"));
	tempDirs.push(directory);
	cpSync(
		join(process.cwd(), "..", ".sdl", "extensions", "flow"),
		join(directory, ".sdl", "extensions", "flow"),
		{ recursive: true },
	);
	return directory;
}

function cleanPushResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git status --porcelain", result: { stdout: "" } },
		{
			match: (call) =>
				call.command === "git" &&
				call.args.length === 1 &&
				call.args[0] === "push" &&
				call.options?.timeoutMs === PUSH_TIMEOUT_MS,
			result: { stdout: "Everything up-to-date\n" },
		},
	];
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl flow push CLI", () => {
	test("static command metadata remains empty without a project extension", async () => {
		expect(listSdlCommands()).toEqual([]);

		const topHelp = runWithFakes({ args: ["--help"], state: { exec: [] } });
		expect(await topHelp.exit).toBe(0);
		const help = topHelp.stdout.join("");
		expect(help).toContain("Usage: sdl");
		expect(help).not.toContain("push");
		expect(topHelp.stderr.join("")).toBe("");
	});

	test("project-local flow package appears as a group in root help", async () => {
		const cwd = await createPushProject();

		const rootHelp = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });
		expect(await rootHelp.exit).toBe(0);
		const help = rootHelp.stdout.join("");
		expect(help).toContain("flow");
		expect(help).toContain("SDL flow commands.");
		expect(help).not.toContain("push [options]");
		expect(help).not.toContain("pull-trunk [options]");
		expect(rootHelp.stderr.join("")).toBe("");
	});

	test("project-local push extension appears in help and selected schema", async () => {
		const cwd = await createPushProject();

		const topHelp = runWithFakes({ args: ["flow", "--help"], state: { exec: [] }, cwd });
		expect(await topHelp.exit).toBe(0);
		const topLevelHelp = topHelp.stdout.join("");
		expect(topLevelHelp).toContain("push");
		expect(topLevelHelp).toMatch(/Push already-committed work on the current\s+branch/);
		expect(topHelp.stderr.join("")).toBe("");

		const commandHelp = runWithFakes({
			args: ["flow", "push", "--help"],
			state: { exec: [] },
			cwd,
		});
		expect(await commandHelp.exit).toBe(0);
		const help = commandHelp.stdout.join("");
		expect(help).toContain("Usage: sdl flow push");
		expect(help).toContain("plain git push");
		expect(help).toContain("clean worktree");
		expect(help).toContain("sdl flow submit");
		expect(help).not.toContain("--format");

		const schema = runWithFakes({
			args: ["flow", "push", "--json-schema"],
			state: { exec: [] },
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("clean status runs git push with a two-minute timeout", async () => {
		const cwd = await createPushProject();
		const run = runWithFakes({
			args: ["flow", "push"],
			state: { exec: cleanPushResponses() },
			cwd,
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("`git push` completed successfully.");
		expect(output).toContain("Command: git push");
		expect(output).not.toContain("Everything up-to-date");
		expect(output).not.toContain("stdout:");
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain", "git push"]);
		expect(run.context.execCalls[1]?.options).toEqual({ timeoutMs: PUSH_TIMEOUT_MS });
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("dirty status blocks git push and prints porcelain status", async () => {
		const cwd = await createPushProject();
		const run = runWithFakes({
			args: ["flow", "push"],
			state: {
				exec: [
					{ match: "git status --porcelain", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
				],
			},
			cwd,
		});

		expect(await run.exit).not.toBe(0);
		const error = run.stderr.join("");
		expect(error).toContain("requires a clean worktree");
		expect(error).toContain("did not run `git push`");
		expect(error).toContain(" M src/app.ts");
		expect(error).toContain("?? notes.md");
		expect(error).toContain("sdl flow submit");
		expect(run.stdout.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain"]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("status failure blocks git push and includes command evidence", async () => {
		const cwd = await createPushProject();
		const run = runWithFakes({
			args: ["flow", "push"],
			state: {
				exec: [
					{
						match: "git status --porcelain",
						result: { code: 128, stderr: "fatal: not a git repository\n" },
					},
				],
			},
			cwd,
		});

		expect(await run.exit).not.toBe(0);
		const error = run.stderr.join("");
		expect(error).toContain("Could not inspect the worktree status");
		expect(error).toContain("Command: git status --porcelain");
		expect(error).toContain("Exit: 128");
		expect(error).toContain("fatal: not a git repository");
		expect(error).toContain("sdl flow submit");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain"]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("nonzero git push fails with stdout stderr evidence and submit guidance", async () => {
		const cwd = await createPushProject();
		const run = runWithFakes({
			args: ["flow", "push"],
			state: {
				exec: [
					{ match: "git status --porcelain", result: { stdout: "" } },
					{
						match: "git push",
						result: { code: 1, stdout: "rejected update\n", stderr: "non-fast-forward\n" },
					},
				],
			},
			cwd,
		});

		expect(await run.exit).not.toBe(0);
		const error = run.stderr.join("");
		expect(error).toContain("`git push` failed");
		expect(error).toContain("Command: git push");
		expect(error).toContain("Exit: 1");
		expect(error).toContain("rejected update");
		expect(error).toContain("non-fast-forward");
		expect(error).toContain("sdl flow submit");
		expect(error).toContain("/sdl:flow:submit");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain", "git push"]);
		expect(run.context.execCalls[1]?.options).toEqual({ timeoutMs: PUSH_TIMEOUT_MS });
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("killed git push is a failure even with exit code zero", async () => {
		const cwd = await createPushProject();
		const run = runWithFakes({
			args: ["flow", "push"],
			state: {
				exec: [
					{ match: "git status --porcelain", result: { stdout: "" } },
					{ match: "git push", result: { code: 0, killed: true, stderr: "timed out\n" } },
				],
			},
			cwd,
		});

		expect(await run.exit).not.toBe(0);
		const error = run.stderr.join("");
		expect(error).toContain("`git push` failed");
		expect(error).toContain("Exit: 0");
		expect(error).toContain("Killed: true");
		expect(error).toContain("timed out");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain", "git push"]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("unexpected arguments fail before any git command", async () => {
		const cwd = await createPushProject();
		const run = runWithFakes({ args: ["flow", "push", "unexpected"], state: { exec: [] }, cwd });

		expect(await run.exit).not.toBe(0);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).not.toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});
});
