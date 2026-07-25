import { describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress, type DescriptorCommand } from "@nseng-ai/sdk";
import { runCli, type NsCliBaseContext, type NsCliDeps } from "@nseng-ai/sdk/cli";
import { nsExtensionInstallCommand } from "@nseng-ai/ns-init/ns/commands/extension-install";
import { nsExtensionUninstallCommand } from "@nseng-ai/ns-init/ns/commands/extension-uninstall";
import { nsInitNsCommand } from "@nseng-ai/ns-init/ns/commands/init";

import { nsExtensionListCommand } from "../src/ns/commands/extension-list.ts";

interface CliRun {
	readonly exit: number;
	readonly stdout: string;
	readonly stderr: string;
}

const commands = [
	{ command: nsInitNsCommand, segments: ["init"] },
	{ command: nsExtensionInstallCommand, segments: ["extension", "install"] },
	{ command: nsExtensionListCommand, segments: ["extension", "list"] },
	{ command: nsExtensionUninstallCommand, segments: ["extension", "uninstall"] },
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
						...(segments[0] === "extension"
							? { groupDescription: "Inspect and manage ns extensions." }
							: {}),
						description: command.summary,
						fullDescription: command.description,
						source: { level: "preinstalled" as const, label: "ns-init contract test" },
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
				...(segments[0] === "extension"
					? { groupDescription: "Inspect and manage ns extensions." }
					: {}),
				description: command.summary,
				fullDescription: command.description,
			})),
			diagnostics: [],
			extensionPackageNames: new Set(["@nseng-ai/ns-init"]),
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

const context: NsCliBaseContext = {
	cwd: "/work/ns-init-contracts",
	env: {},
	commandIo: noopNsCommandIo,
	progress: noopNsProgress,
	renderCapabilities: { canEmitAnsi: false },
	outputFormat: "human",
	exec: async (command, args) => {
		throw new Error(`CLI contract unexpectedly spawned: ${[command, ...args].join(" ")}`);
	},
	textGenerator: {
		generateText: async () => {
			throw new Error("CLI contract unexpectedly requested text generation.");
		},
	},
};

async function run(args: readonly string[]): Promise<CliRun> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const exit = await runCli(args, {
		context,
		cwd: context.cwd,
		env: context.env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
		extensionRegistry,
	});
	return { exit, stdout: stdout.join(""), stderr: stderr.join("") };
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

describe("ns-init CLI contracts", () => {
	test("publishes loaded init help metadata", async () => {
		const result = await run(["init", "--help"]);

		expect(result.exit).toBe(0);
		expect(result.stdout).toContain("Usage: ns init");
		expect(result.stdout).toContain("Activate ns in this repository by writing ns.toml");
		expect(result.stderr).toBe("");
	});

	test("publishes extension install help, schema, and missing-argument usage contracts", async () => {
		const help = await run(["extension", "install", "-h"]);
		expect(help.exit).toBe(0);
		expect(help.stdout).toContain("Usage: ns extension install [options] <source>");
		expect(help.stdout).not.toContain("--harness");
		expect(help.stdout).not.toContain("--yes");
		expect(help.stdout).not.toContain("--force");

		const schemaRun = await run(["extension", "install", "--json-schema"]);
		expect(schemaRun.exit).toBe(0);
		const schema = JSON.parse(schemaRun.stdout) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaRun.stdout).toContain("sourceSpec");
		expect(schemaRun.stdout).toContain("completed");

		const usage = await runJson(["extension", "install"]);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
		});
	});

	test("publishes extension list help, schema, and extra-argument usage contracts", async () => {
		const help = await run(["extension", "list", "-h"]);
		expect(help.exit).toBe(0);
		expect(help.stdout).toContain("Usage: ns extension list|ls [options]");
		expect(help.stdout).toContain("without\nacquiring packages or changing files");
		expect(help.stdout).not.toContain("--yes");
		expect(help.stdout).not.toContain("--force");

		const schemaRun = await run(["extension", "list", "--json-schema"]);
		expect(schemaRun.exit).toBe(0);
		const schema = JSON.parse(schemaRun.stdout) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaRun.stdout).toContain("sourceSpec");
		expect(schemaRun.stdout).toContain("acquisitionStatus");
		expect(schemaRun.stdout).toContain("affectedArtifactCount");

		const usage = await runJson(["extension", "list", "unexpected"]);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
		});
	});

	test("publishes extension uninstall help, schema, and missing-argument usage contracts", async () => {
		const help = await run(["extension", "uninstall", "-h"]);
		expect(help.exit).toBe(0);
		expect(help.stdout).toContain("Usage: ns extension uninstall [options] <source>");
		expect(help.stdout).not.toContain("--harness");
		expect(help.stdout).not.toContain("--yes");
		expect(help.stdout).not.toContain("--force");

		const schemaRun = await run(["extension", "uninstall", "--json-schema"]);
		expect(schemaRun.exit).toBe(0);
		const schema = JSON.parse(schemaRun.stdout) as Record<string, unknown>;
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(schemaRun.stdout).toContain("sourceIdentity");
		expect(schemaRun.stdout).toContain("cleanup");

		const usage = await runJson(["extension", "uninstall"]);
		expect(usage.exit).toBe(2);
		expect(parseJsonOutput(usage)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
		});
	});

	test("rejects retired extension lifecycle aliases", async () => {
		for (const args of [
			["install", "./extension"],
			["uninstall", "./extension"],
			["remove", "./extension"],
			["extension", "remove", "./extension"],
		]) {
			const result = await runJson(args);
			expect(result.exit).toBe(2);
			expect(result.stderr).toContain("unknown command");
		}
	});
});
