import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";

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
] as const) {
	test(`selected definitions reject ${label}`, async () => {
		const commandDirectory = await createCommandDirectory({ commandSource });
		await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow(
			"malformed command definition",
		);
	});
}
