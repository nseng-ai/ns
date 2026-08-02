import { describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import { runCli, type NsCliBaseContext } from "@nseng-ai/sdk/cli";
import { createTestNsCliExtensionRegistry } from "@nseng-ai/sdk/testing";
import { nsExtensionInstallCommand } from "../src/init/ns/commands/extension-install.ts";
import { nsExtensionUpdateCommand } from "../src/init/ns/commands/extension-update.ts";
import { nsExtensionUninstallCommand } from "../src/init/ns/commands/extension-uninstall.ts";
import { nsInitNsCommand } from "../src/init/ns/commands/init.ts";

import { nsExtensionListCommand } from "../src/init/ns/commands/extension-list.ts";

interface CliRun {
	readonly exit: number;
	readonly stdout: string;
	readonly stderr: string;
}

const extensionGroupDescription = "Inspect and manage ns extensions.";

const extensionRegistry = createTestNsCliExtensionRegistry({
	commands: [
		{ command: nsInitNsCommand, segments: ["init"] },
		{
			command: nsExtensionInstallCommand,
			segments: ["extension", "install"],
			groupDescription: extensionGroupDescription,
		},
		{
			command: nsExtensionListCommand,
			segments: ["extension", "list"],
			groupDescription: extensionGroupDescription,
		},
		{
			command: nsExtensionUpdateCommand,
			segments: ["extension", "update"],
			groupDescription: extensionGroupDescription,
		},
		{
			command: nsExtensionUninstallCommand,
			segments: ["extension", "uninstall"],
			groupDescription: extensionGroupDescription,
		},
	],
	extensionPackageNames: ["@nseng-ai/ns"],
	sourceLabel: "ns-init contract test",
});

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

async function expectScopeContract(options: {
	readonly command: "install" | "list" | "update" | "uninstall";
	readonly positional?: string;
}): Promise<void> {
	const prefix = ["extension", options.command];
	const help = await run([...prefix, "-h"]);
	expect(help.exit).toBe(0);
	expect(help.stdout).toContain("project scope by default");
	expect(help.stdout).toContain("--scope");
	expect(help.stdout).toContain("-s");

	const schemaRun = await run([...prefix, "--json-schema"]);
	expect(schemaRun.exit).toBe(0);
	const schema = JSON.parse(schemaRun.stdout) as Record<string, unknown>;
	expect(schema).toHaveProperty("inputJsonSchema");
	expect(schema).toHaveProperty("outputJsonSchema");
	expect(schemaRun.stdout).toContain('"scope"');
	expect(schemaRun.stdout).toContain('"project"');
	expect(schemaRun.stdout).toContain('"user"');

	const invalid = await runJson([
		...prefix,
		...(options.positional === undefined ? [] : [options.positional]),
		"--scope",
		"global",
	]);
	expect(invalid.exit).toBe(2);
	expect(parseJsonOutput(invalid)).toMatchObject({
		status: "usageError",
		errorType: "usageError",
	});
}

describe("ns-init CLI contracts", () => {
	test("publishes loaded init help metadata", async () => {
		const result = await run(["init", "--help"]);

		expect(result.exit).toBe(0);
		expect(result.stdout).toContain("Usage: ns init");
		expect(result.stdout).toContain("Activate ns in this repository by writing ns.toml");
		expect(result.stdout).toContain("--supported-harness");
		expect(result.stdout).toContain("-H");
		expect(result.stdout).not.toMatch(/(^|\s)--harness(?:\s|$)/u);
		expect(result.stderr).toBe("");
	});

	test("publishes extension install help, schema, and missing-argument usage contracts", async () => {
		await expectScopeContract({ command: "install", positional: "./extension" });
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
		await expectScopeContract({ command: "list" });
		const help = await run(["extension", "list", "-h"]);
		expect(help.exit).toBe(0);
		expect(help.stdout).toContain("Usage: ns extension list|ls [options]");
		expect(help.stdout).toContain("installed package extensions");
		expect(help.stdout).toContain("command-only");
		expect(help.stdout).toContain("user declarations");
		expect(help.stdout).toContain("acquiring packages or changing files");
		expect(help.stdout).toContain("--scope");
		expect(help.stdout).toContain("-s");
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

	test("publishes extension update help, input/output schemas, and invalid scope", async () => {
		await expectScopeContract({ command: "update", positional: "./extension" });
		const schema = await run(["extension", "update", "--json-schema"]);
		expect(schema.stdout).toContain("refresh-floating");
		expect(schema.stdout).toContain("local-in-place");
		expect(schema.stdout).toContain("not-performed");
	});

	test("publishes extension uninstall help, schema, and missing-argument usage contracts", async () => {
		await expectScopeContract({ command: "uninstall", positional: "./extension" });
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
