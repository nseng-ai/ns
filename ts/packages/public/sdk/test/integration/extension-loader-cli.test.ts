import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "../scenario/ns-cli-fakes.ts";

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

async function createEmptyProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-project-"));
	tempDirs.push(directory);
	return directory;
}

function helpSection(help: string, heading: string): string {
	const start = help.indexOf(`${heading}\n`);
	if (start === -1) return "";
	const sectionStart = start + heading.length + 1;
	const nextHeading = help.slice(sectionStart).search(/^\S[^\n]*:\n/m);
	return nextHeading === -1
		? help.slice(sectionStart)
		: help.slice(sectionStart, sectionStart + nextHeading);
}

function helpRow(help: string, heading: string, commandName: string): string | undefined {
	return helpSection(help, heading)
		.split("\n")
		.find((line) => line.startsWith(`  ${commandName}`));
}

async function createDescriptorProject(
	commandName: string,
	commandSource: string,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-project-"));
	tempDirs.push(directory);
	writeDescriptorPackage(directory, [commandName]);
	writeDescriptorCommand(directory, commandName, commandSource);
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

describe("ns extension loader CLI integration", () => {
	test("SDK CLI has no preinstalled commands without host injection", async () => {
		const cwd = await createEmptyProject();
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).not.toContain("objective");
		expect(help).not.toContain("List Objective records in the current checkout.");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("direct command summary appears in top-level help after importing the module", async () => {
		const cwd = await createDescriptorProject(
			"hello",
			`import { ok } from "@nseng-ai/sdk";

export default {
	name: "hello",
	summary: "Say hello from help.",
	description: "Say hello with details.",
	run() { return ok("hello"); },
};
`,
		);
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(helpSection(help, "Extensions:")).toContain("hello");
		expect(helpSection(help, "Extensions:")).toContain("Say hello from help.");
		expect(helpSection(help, "Built-ins:")).not.toContain("hello");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("marks package and local-path extension rows but not catalog rows", async () => {
		const cwd = await createEmptyProject();
		writeFileSyncWithParents(
			join(cwd, "ns.toml"),
			'extensions = ["npm:package-tool", "./extensions/local-tool"]\n',
		);
		writeExtensionPackageAt(
			join(cwd, ".ns", "managed-extensions", "npm", "package-tool", "node_modules", "package-tool"),
			{ packageName: "package-tool", group: "package-tool", commandName: "ping" },
		);
		writeExtensionPackageAt(join(cwd, "extensions", "local-tool"), {
			packageName: "local-tool",
			group: "local-tool",
			commandName: "ping",
		});
		const run = runWithFakes({
			args: ["--help"],
			state: { exec: [] },
			cwd,
			preinstalledCommandCatalog: async () => ({
				entries: [
					{
						group: "global-tool",
						groupDescription: "Global tool commands.",
						name: "ping",
						description: "Ping globally.",
						fullDescription: "Ping globally.",
						moduleSpecifier: "@example/global-tool/ping",
					},
				],
				extensionPackageNames: [],
			}),
		});

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(helpRow(help, "Extensions:", "global-tool")).not.toMatch(/[plg]$/);
		expect(helpRow(help, "Extensions:", "package-tool")).toMatch(/p$/);
		expect(helpRow(help, "Extensions:", "local-tool")).toMatch(/l$/);
		const extensionRow = helpRow(help, "Built-ins:", "extension");
		expect(extensionRow).toContain("Inspect ns extension metadata.");
		expect(extensionRow).not.toMatch(/[plg]$/);
		expect(helpRow(help, "Extensions:", "extension")).toBeUndefined();
	});

	test("an override displays only the effective winner origin", async () => {
		const cwd = await createDescriptorProject(
			"hello",
			'import { ok } from "@nseng-ai/sdk"; export default { name: "hello", summary: "Local hello.", description: "Local hello.", run() { return ok({}); } };',
		);
		const run = runWithFakes({
			args: ["--help"],
			state: { exec: [] },
			cwd,
			preinstalledCommandCatalog: async () => ({
				entries: [
					{
						name: "hello",
						description: "Global hello.",
						fullDescription: "Global hello.",
						moduleSpecifier: "@example/hello",
					},
				],
				extensionPackageNames: [],
			}),
		});

		expect(await run.exit).toBe(0);
		const row = helpRow(run.stdout.join(""), "Extensions:", "hello");
		expect(row).toContain("Local hello.");
		expect(row).toMatch(/l$/);
	});

	test("mixed effective namespaces display the highest-precedence winning origin", async () => {
		const cwd = await createEmptyProject();
		writeFileSyncWithParents(join(cwd, "ns.toml"), 'extensions = ["./extensions/mixed"]\n');
		writeDescriptorPackage(cwd, ["local"], { group: "mixed" });
		writeDescriptorCommand(
			cwd,
			"local",
			'import { ok } from "@nseng-ai/sdk"; export default { name: "local", summary: "Local.", description: "Local.", run() { return ok({}); } };',
		);
		const run = runWithFakes({
			args: ["--help"],
			state: { exec: [] },
			cwd,
			preinstalledCommandCatalog: async () => ({
				entries: [
					{
						group: "mixed",
						groupDescription: "Mixed commands.",
						name: "global",
						description: "Global.",
						fullDescription: "Global.",
						moduleSpecifier: "@example/mixed/global",
					},
				],
				extensionPackageNames: [],
			}),
		});

		expect(await run.exit).toBe(0);
		expect(helpRow(run.stdout.join(""), "Extensions:", "mixed")).toMatch(/l$/);
	});

	test("package-sourced extensions list before repo-local extensions in help", async () => {
		const cwd = await createEmptyProject();
		writeFileSyncWithParents(
			join(cwd, "ns.toml"),
			'extensions = ["npm:zzz-tool", "./extensions/aaa-local"]\n',
		);
		// Managed npm extension whose group sorts alphabetically after the local one.
		writeExtensionPackageAt(
			join(cwd, ".ns", "managed-extensions", "npm", "zzz-tool", "node_modules", "zzz-tool"),
			{ packageName: "zzz-tool", group: "zzz-tool", commandName: "ping" },
		);
		writeExtensionPackageAt(join(cwd, "extensions", "aaa-local"), {
			packageName: "aaa-local",
			group: "aaa-local",
			commandName: "ping",
		});
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const extensions = helpSection(run.stdout.join(""), "Extensions:");
		expect(extensions).toMatch(/^  zzz-tool(?:\s|$)/m);
		expect(extensions).toMatch(/^  aaa-local(?:\s|$)/m);
		expect(extensions.search(/^  zzz-tool(?:\s|$)/m)).toBeLessThan(
			extensions.search(/^  aaa-local(?:\s|$)/m),
		);
		expect(run.stderr.join("")).toBe("");
	});

	test("rejects a project extension contribution to a built-in namespace", async () => {
		const cwd = await createEmptyProject();
		writeDescriptorPackage(cwd, ["aaa"], { group: "extension" });
		writeDescriptorCommand(
			cwd,
			"aaa",
			`import { ok } from "@nseng-ai/sdk";
export default { name: "aaa", summary: "Conflicting project extension command.", description: "Conflicting project extension command.", run() { return ok({}); } };
`,
		);
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain(
			"Project extension command extension/aaa cannot contribute to built-in namespace extension",
		);
		expect(run.stderr.join("")).toContain("Choose a different top-level command namespace.");
		expect(run.context.execCalls).toEqual([]);
	});

	test("throwing direct command keeps placeholder in top-level help and warns", async () => {
		const cwd = await createDescriptorProject("hello", "throw new Error('module boom');\n");
		const run = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("hello");
		expect(help).toContain("Load ns descriptor command hello.");
		expect(run.stderr.join("")).toContain("Warning:");
		expect(run.stderr.join("")).toContain("module boom");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-local command help uses selected command metadata and schema", async () => {
		const cwd = await createDescriptorProject(
			"sample",
			`import { ok, z } from "@nseng-ai/sdk";

export default {
	name: "sample",
	summary: "Project sample command.",
	description: "Project sample command with options.",
	schema: z.object({ dryRun: z.boolean().default(false).describe("Preview the sample command.") }),
	run() { return ok("unused"); },
};
`,
		);
		const run = runWithFakes({ args: ["sample", "--help"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: ns sample");
		expect(help).toContain("Project sample command with options.");
		expect(help).toContain("--dry-run");
		expect(help).not.toContain("model-authored");
		expect(help).not.toContain("NS_CHECKPOINT_MODEL");
		expect(help).not.toContain("NS_DEV_CHECKPOINT_MODEL");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
	});

	test("project-only ns command entry runs when invoked", async () => {
		const cwd = await createDescriptorProject(
			"hello",
			`import { ok } from "@nseng-ai/sdk";

export default {
	name: "hello",
	summary: "Say hello.",
	description: "Say hello",
	async run(ctx) {
		const result = await ctx.exec("echo", ["hello"]);
		return ok(result.stdout.trim());
	},
};
`,
		);
		const run = runWithFakes({
			args: ["hello"],
			cwd,
			state: { exec: [{ match: "echo hello", result: { stdout: "hello\n" } }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("hello\n");
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual(["echo hello"]);
	});

	test("selected ns command entry help schema and invocation use the loaded request schema", async () => {
		const cwd = await createDescriptorProject(
			"hello",
			`import { ok, z } from "@nseng-ai/sdk";

export default {
	name: "hello",
	summary: "Say hello.",
	description: "Say hello with options.",
	schema: z.object({ loud: z.boolean().default(false).describe("Use loud output.") }),
	run(_ctx, request) {
		return ok(request.loud ? "HELLO" : "hello");
	},
};
`,
		);

		const helpRun = runWithFakes({ args: ["hello", "--help"], state: { exec: [] }, cwd });
		expect(await helpRun.exit).toBe(0);
		expect(helpRun.stdout.join("")).toContain("Say hello with options.");
		expect(helpRun.stdout.join("")).toContain("--loud");

		const schemaRun = runWithFakes({ args: ["hello", "--json-schema"], state: { exec: [] }, cwd });
		expect(await schemaRun.exit).toBe(0);
		expect(parseJsonOutput(schemaRun)).toHaveProperty("inputJsonSchema");

		const invokeRun = runWithFakes({ args: ["hello", "--loud"], state: { exec: [] }, cwd });
		expect(await invokeRun.exit).toBe(0);
		expect(invokeRun.stdout.join("")).toBe("HELLO\n");
		expect(invokeRun.context.execCalls).toEqual([]);
	});

	test("selected extension load failure fails only when that command is selected", async () => {
		const cwd = await createThrowingDescriptorProject("hello");

		const helpRun = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });
		expect(await helpRun.exit).toBe(0);
		expect(helpRun.stderr.join("")).toContain("Warning:");
		expect(helpRun.stderr.join("")).toContain("module boom");

		const selectedRun = runWithFakes({ args: ["hello"], state: { exec: [] }, cwd });
		expect(await selectedRun.exit).toBe(2);
		expect(selectedRun.stdout.join("")).toBe("");
		expect(selectedRun.stderr.join("")).toContain("Failed to load ns extension contribution");
		expect(selectedRun.stderr.join("")).toContain("module boom");
		expect(selectedRun.context.execCalls).toEqual([]);
	});

	test("malformed unrelated descriptor warns without breaking a valid project command", async () => {
		const cwd = await createDescriptorProject(
			"hello",
			`import { ok } from "@nseng-ai/sdk";
export default { name: "hello", summary: "Hello", description: "Hello", run() { return ok("hello"); } };
`,
		);
		writeBadDescriptorPackage(cwd);
		const run = runWithFakes({ args: ["hello"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("hello\n");
		expect(run.stderr.join("")).toContain("Warning:");
		expect(run.stderr.join("")).toContain("Invalid ");
		expect(run.stderr.join("")).toContain("description Invalid input");
		expect(run.context.execCalls).toEqual([]);
	});

	test("ns command entry schema must be a Zod object", async () => {
		const cwd = await createDescriptorProject(
			"hello",
			`export default {
	name: "hello",
	summary: "Hello",
	description: "Hello",
	schema: { safeParse() { return { success: true, data: {} }; } },
	run() { return { ok: true, message: "hello" }; },
};
`,
		);
		const run = runWithFakes({ args: ["hello"], state: { exec: [] }, cwd });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			"Invalid ns descriptor command ns.toml descriptor ./extensions/tools",
		);
		expect(run.stderr.join("")).toContain(
			"command schema must be a Zod object schema from @nseng-ai/sdk",
		);
		expect(run.context.execCalls).toEqual([]);
	});
});

async function createThrowingDescriptorProject(commandName: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-project-"));
	tempDirs.push(directory);
	writeDescriptorPackage(directory, [], {
		entriesSource: `{ name: ${JSON.stringify(commandName)}, load: async () => { throw new Error("module boom"); } }`,
	});
	return directory;
}

function writeDescriptorPackage(
	cwd: string,
	commandNames: readonly string[],
	options: { entriesSource?: string; group?: string } = {},
): void {
	writeFileSyncWithParents(join(cwd, "ns.toml"), 'extensions = ["./extensions/tools"]\n');
	writePackageManifest(cwd, "tools");
	const entries =
		options.entriesSource ??
		commandNames
			.map(
				(name) =>
					`{ name: ${JSON.stringify(name)}, load: async () => await import("../commands/${name}.ts") }`,
			)
			.join(",\n\t\t");
	writeFileSyncWithParents(
		join(cwd, "extensions", "tools", "src", "ns", "extension.ts"),
		`import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({
	${options.group === undefined ? "" : `group: ${JSON.stringify(options.group)},`}
	description: "Project test tools.",
	entries: [
		${entries},
	],
});
`,
	);
}

function writeExtensionPackageAt(
	packageRoot: string,
	options: { packageName: string; group: string; commandName: string },
): void {
	writeFileSyncWithParents(
		join(packageRoot, "package.json"),
		JSON.stringify({
			name: options.packageName,
			version: "1.0.0",
			type: "module",
			exports: { "./ns-extension": "./src/ns/extension.ts" },
		}),
	);
	writeFileSyncWithParents(
		join(packageRoot, "src", "ns", "extension.ts"),
		`import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({
	group: ${JSON.stringify(options.group)},
	description: ${JSON.stringify(`${options.group} test commands.`)},
	entries: [
		{ name: ${JSON.stringify(options.commandName)}, load: async () => await import("../commands/${options.commandName}.ts") },
	],
});
`,
	);
	writeFileSyncWithParents(
		join(packageRoot, "src", "commands", `${options.commandName}.ts`),
		`import { ok } from "@nseng-ai/sdk";
export default { name: ${JSON.stringify(options.commandName)}, summary: "Ping.", description: "Ping.", run() { return ok({}); } };
`,
	);
}

function writeDescriptorCommand(cwd: string, commandName: string, source: string): void {
	writeFileSyncWithParents(
		join(cwd, "extensions", "tools", "src", "commands", `${commandName}.ts`),
		source,
	);
}

function writeBadDescriptorPackage(cwd: string): void {
	writeFileSyncWithParents(
		join(cwd, "ns.toml"),
		'extensions = ["./extensions/bad", "./extensions/tools"]\n',
	);
	writePackageManifest(cwd, "bad");
	writeFileSyncWithParents(
		join(cwd, "extensions", "bad", "src", "ns", "extension.ts"),
		"export default {};\n",
	);
}

function writePackageManifest(cwd: string, packageName: string): void {
	writeFileSyncWithParents(
		join(cwd, "extensions", packageName, "package.json"),
		JSON.stringify({
			name: packageName,
			version: "1.0.0",
			type: "module",
			exports: { "./ns-extension": "./src/ns/extension.ts" },
		}),
	);
}
