import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";
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

async function createTemporaryDirectory(prefix: string): Promise<string> {
	const directory = await mkdtemp(path.join(import.meta.dirname, prefix));
	temporaryDirectories.push(directory);
	return directory;
}

async function createCommandDirectory(input: {
	readonly metadataSource?: string;
	readonly commandSource?: string;
}): Promise<string> {
	const directory = await createTemporaryDirectory(".clinkr-module-contract-");
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

const malformedFunctionModuleCases = [
	["missing expected export", "export {};\n"],
	["wrong export name", "export function wrong() {}\n"],
	["non-function expected export", "export const EXPECTED = true;\n"],
	["extra export", "export function EXPECTED() {}\nexport const extra = true;\n"],
] as const;

for (const [label, sourceTemplate] of malformedFunctionModuleCases) {
	test(`metadata modules reject ${label}`, async () => {
		const metadataSource = sourceTemplate.replaceAll("EXPECTED", "metadata");
		const commandDirectory = await createCommandDirectory({ metadataSource });
		const run = await runForCliTest(createClinkrApp({ name: "fixture", commandDirectory }), [
			"--help",
		]);
		expect(run).toMatchObject({ exitCode: 0 });
		expect(run.stderr).toMatch(/malformed metadata module.*metadata\.ts/);
	});

	test(`command modules reject ${label}`, async () => {
		const commandSource = sourceTemplate.replaceAll("EXPECTED", "command");
		const commandDirectory = await createCommandDirectory({ commandSource });
		await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow(
			/malformed command module.*command\.ts/,
		);
	});

	test(`group modules reject ${label}`, async () => {
		const directory = await createTemporaryDirectory(".clinkr-group-contract-");
		const child = path.join(directory, "nested");
		await mkdir(child);
		await writeFile(path.join(child, "group.ts"), sourceTemplate.replaceAll("EXPECTED", "group"));
		const source = createFilesystemSource({ commandDirectory: directory });
		await expect(source.open([])).rejects.toThrow(/malformed group module.*group\.ts/);
	});
}

test.each([
	["a non-object", "return undefined;"],
	["unknown keys", 'return { description: "Fixture command.", unexpected: true };'],
	["invalid field types", "return { description: 5 };"],
] as const)("metadata() rejects %s result", async (_label, resultSource) => {
	const commandDirectory = await createCommandDirectory({
		metadataSource: `export function metadata() { ${resultSource} }\n`,
	});
	const run = await runForCliTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"--help",
	]);
	expect(run).toMatchObject({ exitCode: 0 });
	expect(run.stderr).toMatch(/malformed command metadata.*metadata\.ts/);
});

test.each([
	["a non-object", "return undefined;"],
	["unknown keys", 'return { description: "Nested group.", unexpected: true };'],
	["invalid field types", "return { description: 5 };"],
] as const)("group() rejects %s result", async (_label, resultSource) => {
	const directory = await createTemporaryDirectory(".clinkr-group-contract-");
	const child = path.join(directory, "nested");
	await mkdir(child);
	await writeFile(path.join(child, "group.ts"), `export function group() { ${resultSource} }\n`);
	const source = createFilesystemSource({ commandDirectory: directory });
	await expect(source.open([])).rejects.toThrow(/malformed group definition.*group\.ts/);
});

test("filesystem scope opening accepts a group with a complete default command pair", async () => {
	const directory = await createTemporaryDirectory(".clinkr-group-contract-");
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
	const openedRoot = await source.open([]);
	expect(openedRoot.groups.get("nested")?.definition.description).toBe("Nested group.");
	const openedGroup = await source.open(["nested"]);
	expect(openedGroup.defaultCommand?.metadata.description).toBe("Nested default.");
});

test.each([
	["metadata.ts without command.ts", "metadata.ts"],
	["command.ts without metadata.ts", "command.ts"],
] as const)("filesystem scope opening rejects incomplete pair: %s", async (_label, file) => {
	const directory = await createTemporaryDirectory(".clinkr-pair-contract-");
	const child = path.join(directory, "incomplete");
	await mkdir(child);
	await writeFile(path.join(child, file), "export {};\n");
	const source = createFilesystemSource({ commandDirectory: directory });
	await expect(source.open([])).rejects.toThrow(/incomplete command pair.*incomplete/);
});

test("filesystem scope opening rejects group.ts at the root", async () => {
	const directory = await createTemporaryDirectory(".clinkr-shape-contract-");
	await writeFile(
		path.join(directory, "group.ts"),
		'export function group() { return { description: "Invalid root group." }; }\n',
	);
	const source = createFilesystemSource({ commandDirectory: directory });
	await expect(source.open([])).rejects.toThrow(/malformed root group\.ts.*clinkr-shape-contract/);
});

test.each(["command.js", "metadata.json", "group.mts", "command.ts.bak", "metadata.tsx", "group"])(
	"filesystem scope opening rejects unsupported topology marker %s",
	async (file) => {
		const directory = await createTemporaryDirectory(".clinkr-shape-contract-");
		await writeFile(path.join(directory, file), "export {};\n");
		const source = createFilesystemSource({ commandDirectory: directory });
		await expect(source.open([])).rejects.toThrow(new RegExp(`unsupported topology file ${file}`));
	},
);

test("filesystem scope opening ignores ordinary implementation and support files", async () => {
	const directory = await createTemporaryDirectory(".clinkr-shape-contract-");
	await Promise.all([
		writeFile(path.join(directory, "helpers.ts"), "export const value = 1;\n"),
		writeFile(path.join(directory, "command-helper.ts"), "export const value = 1;\n"),
		writeFile(path.join(directory, "metadata-notes.md"), "support notes\n"),
		writeFile(path.join(directory, "README.md"), "support notes\n"),
	]);
	const source = createFilesystemSource({ commandDirectory: directory });
	await expect(source.open([])).resolves.toEqual({ commands: new Map(), groups: new Map() });
});

test("a missing root command directory fails with its path and filesystem cause", async () => {
	const parent = await createTemporaryDirectory(".clinkr-filesystem-failure-");
	const commandDirectory = path.join(parent, "missing");
	const source = createFilesystemSource({ commandDirectory });
	try {
		await source.open([]);
		expect.unreachable("opening a missing root command directory must fail");
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		expect(error.message).toContain(commandDirectory);
		expect(error.message).toContain("command directory does not exist");
		expect(error.cause).toMatchObject({ code: "ENOENT" });
	}
});

test("a present non-directory command path fails with its path and filesystem cause", async () => {
	const parent = await createTemporaryDirectory(".clinkr-filesystem-failure-");
	const commandDirectory = path.join(parent, "commands");
	await writeFile(commandDirectory, "not a directory\n");
	const source = createFilesystemSource({ commandDirectory });
	try {
		await source.open([]);
		expect.unreachable("opening a non-directory command path must fail");
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		expect(error.message).toContain(commandDirectory);
		expect(error.message).toContain("unable to open filesystem scope <root>");
		expect(error.cause).toMatchObject({ code: "ENOTDIR" });
	}
});

for (const [label, commandSource] of [
	[
		"a synchronous definition result",
		'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport function command() { return defineCommand({ schema: z.object({}), handler: async () => ok() }); }\n',
	],
	["a non-object structured result", "export async function command() { return undefined; }\n"],
	[
		"structured definitions with unknown keys",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), handler: async () => ok(), extra: true }; }\n',
	],
	[
		"structured definitions with retired per-status schema keys",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), negativeSchema: z.object({}), handler: async () => ok() }; }\n',
	],
	[
		"structured definitions with invalid schemas",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), resultSchema: {}, renderHuman: () => "", handler: async () => ok() }; }\n',
	],
	[
		"structured definitions with invalid renderers",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), resultSchema: z.object({}), renderHuman: "no", handler: async () => ok() }; }\n',
	],
	[
		"structured definitions with invalid context discriminants",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { requiresContext: false, schema: z.object({}), handler: async () => ok() }; }\n',
	],
	[
		"structured definitions with present-but-undefined context discriminants",
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
	test(`selected command() rejects ${label}`, async () => {
		const commandDirectory = await createCommandDirectory({ commandSource });
		await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow(
			/malformed command definition.*command\.ts/,
		);
	});
}

test.each([
	[
		"resultSchema without renderHuman",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), resultSchema: z.object({}), handler: async () => ok({}) }; }\n',
		/resultSchema declared without renderHuman.*command\.ts/,
	],
	[
		"renderHuman on a bodyless command",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), renderHuman: () => "", handler: async () => ok() }; }\n',
		/renderHuman\/renderMarkdown declared on a command without resultSchema.*command\.ts/,
	],
	[
		"renderMarkdown on a bodyless command",
		'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), renderMarkdown: () => "", handler: async () => ok() }; }\n',
		/renderHuman\/renderMarkdown declared on a command without resultSchema.*command\.ts/,
	],
] as const)(
	"selected command() rejects %s with a dedicated coupling error",
	async (_label, commandSource, error) => {
		const commandDirectory = await createCommandDirectory({ commandSource });
		await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow(
			error,
		);
	},
);
