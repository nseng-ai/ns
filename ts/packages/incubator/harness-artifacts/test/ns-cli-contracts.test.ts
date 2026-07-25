import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress, type DescriptorCommand } from "@nseng-ai/sdk";
import { runCli, type NsCliBaseContext, type NsCliDeps } from "@nseng-ai/sdk/cli";
import { skillsListNsCommand } from "@nseng-ai/harness-artifacts/ns/commands/list";
import { skillsPathNsCommand } from "@nseng-ai/harness-artifacts/ns/commands/path";
import { nsUpdateCommand } from "@nseng-ai/harness-artifacts/ns/commands/update";

interface CliRun {
	readonly exit: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly execCalls: readonly string[];
}

const commands = [
	{ command: skillsListNsCommand, segments: ["skills", "list"] },
	{ command: skillsPathNsCommand, segments: ["skills", "path"] },
	{ command: nsUpdateCommand, segments: ["update"] },
] as const satisfies readonly { command: DescriptorCommand; segments: readonly string[] }[];

const extensionRegistry: NonNullable<NsCliDeps["extensionRegistry"]> = {
	async loadCommandCatalog() {
		const candidates = new Map(
			commands.map(({ command, segments }) => {
				const key = segments.join("/");
				return [
					key,
					{
						name: command.name,
						segments,
						...(segments[0] === "skills"
							? { groupDescription: "List and provision ns-owned skills into assistant harnesses." }
							: {}),
						description: command.summary,
						fullDescription: command.description,
						source: {
							level: "preinstalled" as const,
							label: "harness-artifacts contract test",
						},
						moduleReference: { type: "file" as const, path: `fake://${key}` },
						hasStaticCommandInfo: true,
					},
				] as const;
			}),
		);
		return {
			candidates,
			commandInfos: commands.map(({ command, segments }) => ({
				name: command.name,
				segments,
				...(segments[0] === "skills"
					? { groupDescription: "List and provision ns-owned skills into assistant harnesses." }
					: {}),
				description: command.summary,
				fullDescription: command.description,
			})),
			diagnostics: [],
			extensionPackageNames: new Set(["@nseng-ai/harness-artifacts"]),
		};
	},
	async loadSelectedCommand(candidate) {
		const key = candidate.segments?.join("/") ?? candidate.name;
		const entry = commands.find(({ segments }) => segments.join("/") === key);
		if (entry === undefined) {
			return {
				ok: false,
				diagnostic: {
					severity: "error",
					code: "extension_command_missing",
					message: `Missing fake command ${key}`,
					commandName: key,
				},
			};
		}
		return {
			ok: true,
			command: entry.command,
			source: candidate.source,
			path: { name: entry.command.name, segments: entry.segments },
		};
	},
};

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
