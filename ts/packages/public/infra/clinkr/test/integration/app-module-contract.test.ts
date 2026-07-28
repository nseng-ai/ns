import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { createFilesystemSource } from "../../src/app/filesystem-source.ts";

// Loader-contract tests: each case writes a freshly generated (usually
// malformed) module set and drives it through Node's real loader, so this
// per-case real-loader fan-out lives in the integration lane. Behavior-matrix
// coverage over well-formed commands lives in test/app-public-seam.test.ts
// against committed, module-cached fixtures.
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	);
});

async function createCommandDirectory(input: {
	readonly metadataSource?: string;
	readonly commandSource?: string;
}): Promise<string> {
	const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-module-contract-"));
	temporaryDirectories.push(directory);
	await Promise.all([
		writeFile(
			path.join(directory, "metadata.ts"),
			input.metadataSource ??
				'export function metadata() { return { description: "Fixture command." }; }\n',
		),
		writeFile(
			path.join(directory, "command.ts"),
			input.commandSource ??
				'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => ok() }); }\n',
		),
	]);
	return directory;
}

test("metadata modules require the exact metadata() export", async () => {
	const commandDirectory = await createCommandDirectory({
		metadataSource:
			'export function metadata() { return { description: "Fixture command." }; }\nexport const extra = true;\n',
	});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	await expect(app.run([])).rejects.toThrow("malformed metadata module");
});

test("metadata() return values are validated exactly", async () => {
	const commandDirectory = await createCommandDirectory({
		metadataSource:
			'export function metadata() { return { description: "Fixture command.", unexpected: true }; }\n',
	});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	await expect(app.run([])).rejects.toThrow("malformed command metadata");
});

test("filesystem scope opening validates exact group() modules without importing child commands", async () => {
	const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-group-contract-"));
	temporaryDirectories.push(directory);
	const child = path.join(directory, "nested");
	await mkdir(child);
	await Promise.all([
		writeFile(
			path.join(child, "group.ts"),
			'export function group() { return { description: "Nested group." }; }\n',
		),
		writeFile(
			path.join(child, "metadata.ts"),
			'export function metadata() { return { description: "Nested default." }; }\n',
		),
		writeFile(path.join(child, "command.ts"), 'throw new Error("command imported eagerly");\n'),
	]);
	const source = createFilesystemSource({ commandDirectory: directory });
	const opened = await source.open([]);
	expect(opened.groups.get("nested")?.definition.description).toBe("Nested group.");
});

test("filesystem scope opening rejects malformed group modules with file diagnostics", async () => {
	const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-group-contract-"));
	temporaryDirectories.push(directory);
	const child = path.join(directory, "nested");
	await mkdir(child);
	await writeFile(
		path.join(child, "group.ts"),
		'export function group() { return { description: "Nested group." }; }\nexport const extra = true;\n',
	);
	const source = createFilesystemSource({ commandDirectory: directory });
	await expect(source.open([])).rejects.toThrow(/malformed group module.*group\.ts/);
});

test("filesystem scope opening rejects incomplete command pairs with directory diagnostics", async () => {
	const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-pair-contract-"));
	temporaryDirectories.push(directory);
	const child = path.join(directory, "incomplete");
	await mkdir(child);
	await writeFile(
		path.join(child, "metadata.ts"),
		'export function metadata() { return { description: "Incomplete." }; }\n',
	);
	const source = createFilesystemSource({ commandDirectory: directory });
	await expect(source.open([])).rejects.toThrow(/incomplete command pair.*incomplete/);
});

test.each(["command.js", "metadata.json", "group.mts", "command.ts.bak"])(
	"filesystem scope opening rejects unsupported topology marker %s",
	async (file) => {
		const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-shape-contract-"));
		temporaryDirectories.push(directory);
		await writeFile(path.join(directory, file), "export {};\n");
		const source = createFilesystemSource({ commandDirectory: directory });
		await expect(source.open([])).rejects.toThrow(new RegExp(`unsupported topology file ${file}`));
	},
);

test("filesystem scope opening ignores ordinary implementation and support files", async () => {
	const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-shape-contract-"));
	temporaryDirectories.push(directory);
	await Promise.all([
		writeFile(path.join(directory, "helpers.ts"), "export const value = 1;\n"),
		writeFile(path.join(directory, "README.md"), "support notes\n"),
	]);
	const source = createFilesystemSource({ commandDirectory: directory });
	await expect(source.open([])).resolves.toEqual({ commands: new Map(), groups: new Map() });
});

test("command modules require the exact command() export", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => ok() }); }\nexport const extra = true;\n',
	});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	await expect(app.run([])).rejects.toThrow("malformed command module");
});

for (const [label, commandSource] of [
	[
		"unknown keys",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), handler: async () => ok(), extra: true }; }\n',
	],
	[
		"retired per-status schema keys",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), negativeSchema: z.object({}), handler: async () => ok() }; }\n',
	],
	[
		"invalid schemas",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), resultSchema: {}, handler: async () => ok() }; }\n',
	],
	[
		"invalid renderers",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), renderHuman: "no", handler: async () => ok() }; }\n',
	],
	[
		"invalid context discriminants",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { requiresContext: false, schema: z.object({}), handler: async () => ok() }; }\n',
	],
	[
		"present-but-undefined context discriminants",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { requiresContext: undefined, schema: z.object({}), handler: async () => ok() }; }\n',
	],
	[
		"unrecognized variant discriminants",
		'export async function command() { return { type: "rawish", run: () => 0 }; }\n',
	],
	[
		"raw definitions with unknown keys",
		'export async function command() { return { type: "raw", run: () => 0, extra: true }; }\n',
	],
	[
		"raw definitions with structured-only members",
		'import { z } from "zod";\nexport async function command() { return { type: "raw", run: () => 0, schema: z.object({}) }; }\n',
	],
	[
		"raw definitions with an explicit false context discriminant",
		'export async function command() { return { type: "raw", run: () => 0, requiresContext: false }; }\n',
	],
	[
		"raw definitions without a run function",
		'export async function command() { return { type: "raw" }; }\n',
	],
	[
		"raw definitions with a non-function run",
		'export async function command() { return { type: "raw", run: 5 }; }\n',
	],
] as const) {
	test(`selected definitions reject ${label}`, async () => {
		const commandDirectory = await createCommandDirectory({ commandSource });
		await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow(
			"malformed command definition",
		);
	});
}
