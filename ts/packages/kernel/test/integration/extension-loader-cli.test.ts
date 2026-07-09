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
	test("kernel CLI has no preinstalled commands without host injection", async () => {
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
			`import { ok } from "@nseng-ai/kernel/sdk";

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
		expect(help).toContain("hello");
		expect(help).toContain("Say hello from help.");
		expect(run.stderr.join("")).toBe("");
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
			`import { ok, z } from "@nseng-ai/kernel/sdk";

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
			`import { ok } from "@nseng-ai/kernel/sdk";

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
			`import { ok, z } from "@nseng-ai/kernel/sdk";

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
			`import { ok } from "@nseng-ai/kernel/sdk";
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
			"command schema must be a Zod object schema from @nseng-ai/kernel/sdk",
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
	options: { entriesSource?: string } = {},
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
		`import { defineExtension } from "@nseng-ai/kernel/sdk";
export default defineExtension({
	description: "Project test tools.",
	entries: [
		${entries},
	],
});
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
			type: "module",
			exports: { "./ns-extension": "./src/ns/extension.ts" },
		}),
	);
}
