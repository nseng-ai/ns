import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import { runCli, type NsCliBaseContext } from "@nseng-ai/sdk/cli";
import { createTestNsCliExtensionRegistry } from "@nseng-ai/sdk/testing";
import { skillsListNsCommand } from "../src/harness-artifacts/ns/commands/list.ts";
import { skillsPathNsCommand } from "../src/harness-artifacts/ns/commands/path.ts";
import { nsUpdateCommand } from "../src/harness-artifacts/ns/commands/update.ts";

interface CliRun {
	readonly exit: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly execCalls: readonly string[];
}

const skillsGroupDescription = "List and provision ns-owned skills into assistant harnesses.";

const extensionRegistry = createTestNsCliExtensionRegistry({
	commands: [
		{
			command: skillsListNsCommand,
			segments: ["skills", "list"],
			groupDescription: skillsGroupDescription,
		},
		{
			command: skillsPathNsCommand,
			segments: ["skills", "path"],
			groupDescription: skillsGroupDescription,
		},
		{ command: nsUpdateCommand, segments: ["update"] },
	],
	extensionPackageNames: ["@nseng-ai/ns"],
	sourceLabel: "harness-artifacts contract test",
});

async function run(args: readonly string[]): Promise<CliRun> {
	const cwd = "/work/harness-artifacts-contracts";
	const homeDir = "/home/ns-test";
	const env = {
		HOME: homeDir,
		CLAUDE_CONFIG_DIR: "/config/claude",
	};
	const stdout: string[] = [];
	const stderr: string[] = [];
	const execCalls: string[] = [];
	const context: NsCliBaseContext = {
		cwd,
		homeDir,
		env,
		commandIo: noopNsCommandIo,
		progress: noopNsProgress,
		renderCapabilities: { canEmitAnsi: false },
		outputFormat: "human",
		exec: async (command, commandArgs) => {
			const display = [command, ...commandArgs].join(" ");
			execCalls.push(display);
			if (display === "git rev-parse --show-toplevel") {
				return {
					type: "exited",
					code: 128,
					signal: null,
					stdout: "",
					stderr: "fatal: not a git repository",
				};
			}
			throw new Error(`CLI contract unexpectedly spawned: ${display}`);
		},
		textGenerator: {
			generateText: async () => {
				throw new Error("CLI contract unexpectedly requested text generation.");
			},
		},
	};
	const exit = await runCli(args, {
		context,
		cwd,
		homeDir,
		env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
		extensionRegistry,
	});
	return {
		exit,
		stdout: stdout.join(""),
		stderr: stderr.join(""),
		execCalls,
	};
}

async function runJson(args: readonly string[]): Promise<CliRun> {
	return await run([...args, "--format", "json"]);
}

function parseJsonOutput(result: CliRun): Record<string, unknown> {
	const parsed: unknown = JSON.parse(result.stdout);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Expected JSON object output.");
	}
	return parsed as Record<string, unknown>;
}

function dataFromEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
	const data = envelope.data;
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected envelope data object.");
	}
	return data as Record<string, unknown>;
}

describe("harness-artifacts CLI contracts", () => {
	test("publishes skills list help and stable machine output", async () => {
		const help = await run(["skills", "list", "--help"]);
		expect(help.exit).toBe(0);
		expect(help.stdout).toContain("Usage: ns skills list");
		expect(help.stdout).toContain("List first-party ns-owned skills");
		expect(help.stderr).toBe("");
		expect(help.execCalls).toEqual([]);

		const result = await runJson(["skills", "list"]);
		expect(result.exit).toBe(0);
		expect(dataFromEnvelope(parseJsonOutput(result))).toMatchObject({
			catalogId: "ns-first-party",
			skills: expect.arrayContaining([
				expect.objectContaining({ id: "objective-skill", skillName: "objective" }),
			]),
		});
		expect(result.stderr).toBe("");
		expect(result.execCalls).toEqual(["git rev-parse --show-toplevel"]);
	});

	test("publishes skills path help and resolves an alias in user scope", async () => {
		const help = await run(["skills", "path", "--help"]);
		expect(help.exit).toBe(0);
		expect(help.stdout).toContain("Usage: ns skills path [options] <skill>");
		expect(help.stdout).toContain("--harness");
		expect(help.stdout).toContain("--scope");
		expect(help.stderr).toBe("");
		expect(help.execCalls).toEqual([]);

		const result = await runJson([
			"skills",
			"path",
			"objective",
			"--harness",
			"claude",
			"--scope",
			"user",
		]);
		const expectedRoot = join("/config/claude", "skills");
		expect(result.exit).toBe(0);
		expect(dataFromEnvelope(parseJsonOutput(result))).toMatchObject({
			skill: "objective",
			artifactId: "objective-skill",
			harness: "claude-code",
			scope: "user",
			targetRoot: expectedRoot,
			targetArtifactPath: join(expectedRoot, "objective"),
		});
		expect(result.stderr).toBe("");
		expect(result.execCalls).toEqual(["git rev-parse --show-toplevel"]);
	});

	test("publishes update help and schema", async () => {
		const help = await run(["update", "--help"]);
		expect(help.exit).toBe(0);
		expect(help.stdout).toContain("Usage: ns update");
		expect(help.stdout).toContain("Reserved ns self-update surface");
		expect(help.stdout).not.toContain("--extensions");
		expect(help.stdout).not.toContain("--all");
		expect(help.stdout).not.toContain("--force");
		expect(help.stderr).toBe("");
		expect(help.execCalls).toEqual([]);

		const schemaRun = await run(["update", "--json-schema"]);
		expect(schemaRun.exit).toBe(0);
		const schema = JSON.parse(schemaRun.stdout) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schema).toHaveProperty("machineEnvelopeJsonSchema");
		expect(schemaRun.stdout).toContain("isImplemented");
		expect(schemaRun.stderr).toBe("");
		expect(schemaRun.execCalls).toEqual([]);
	});

	test("reports bare update as a machine-readable not-implemented failure", async () => {
		const result = await runJson(["update"]);
		const envelope = parseJsonOutput(result);

		expect(result.exit).toBe(2);
		expect(envelope).toMatchObject({
			status: "failure",
			errorType: "self-update-not-implemented",
		});
		expect(envelope.message).toContain("ns extension update <source>");
		expect(result.execCalls).toEqual(["git rev-parse --show-toplevel"]);
	});

	test("rejects the retired update --extensions flag", async () => {
		const result = await runJson(["update", "--extensions"]);

		expect(result.exit).toBe(2);
		expect(parseJsonOutput(result)).toMatchObject({ status: "usageError", exitCode: 2 });
		expect(result.execCalls).toEqual([]);
	});
});
