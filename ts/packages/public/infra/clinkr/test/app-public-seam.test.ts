import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, expect, test } from "vitest";
import { z } from "zod";

import { createClinkrApp, failure, negative, ok, usageError } from "@nseng-ai/clinkr";
import { runForTest } from "@nseng-ai/clinkr/testing";

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
	const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-public-seam-"));
	temporaryDirectories.push(directory);
	await Promise.all([
		writeFile(path.join(directory, "counter.ts"), "export const counter = { handlerCalls: 0 };\n"),
		writeFile(
			path.join(directory, "metadata.ts"),
			input.metadataSource ??
				'export function metadata() { return { description: "Fixture command." }; }\n',
		),
		writeFile(
			path.join(directory, "command.ts"),
			input.commandSource ??
				'import { defineCommand, ok } from "@nseng-ai/clinkr";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => ok() }); }\n',
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
			'import { defineCommand, ok } from "@nseng-ai/clinkr";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => ok() }); }\nexport const extra = true;\n',
	});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	await expect(app.run([])).rejects.toThrow("malformed command module");
});

for (const [label, commandSource] of [
	[
		"unknown keys",
		'import { ok } from "@nseng-ai/clinkr";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), handler: async () => ok(), extra: true }; }\n',
	],
	[
		"invalid schemas",
		'import { ok } from "@nseng-ai/clinkr";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), resultSchema: {}, handler: async () => ok() }; }\n',
	],
	[
		"invalid renderers",
		'import { ok } from "@nseng-ai/clinkr";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), renderHuman: "no", handler: async () => ok() }; }\n',
	],
	[
		"invalid context discriminants",
		'import { ok } from "@nseng-ai/clinkr";\nimport { z } from "zod";\nexport async function command() { return { requiresContext: false, schema: z.object({}), handler: async () => ok() }; }\n',
	],
] as const) {
	test(`selected definitions reject ${label}`, async () => {
		const commandDirectory = await createCommandDirectory({ commandSource });
		await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow(
			"malformed command definition",
		);
	});
}

test.each([["--help"], ["--json-schema"], ["--unknown"]])(
	"%s neither reads stdin nor invokes the handler",
	async (flag) => {
		let stdinReads = 0;
		const commandDirectory = await createCommandDirectory({
			commandSource:
				'import { defineCommand, ok } from "@nseng-ai/clinkr";\nimport { z } from "zod";\nimport { counter } from "./counter.ts";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => { counter.handlerCalls += 1; return ok(); } }); }\n',
		});
		const app = createClinkrApp({ name: "fixture", commandDirectory });
		const run = await runForTest(app, [flag], {
			io: {
				stdout: () => {},
				stderr: () => {},
				readStdin: async () => {
					stdinReads += 1;
					return "{}";
				},
			},
		});
		const counterModule: unknown = await import(path.join(commandDirectory, "counter.ts"));
		if (!isCounterModule(counterModule)) throw new Error("Malformed test counter module");
		expect(run.exitCode).toBe(flag === "--unknown" ? 2 : 0);
		expect({ stdinReads, handlerCalls: counterModule.counter.handlerCalls }).toEqual({
			stdinReads: 0,
			handlerCalls: 0,
		});
	},
);

test("new-path JSON Schema composes status schemas and framework usage alternatives", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({ name: z.string() }), resultSchema: z.object({ result: z.string() }), negativeSchema: z.object({ negative: z.string() }), failureSchema: z.object({ failure: z.string() }), usageErrorSchema: z.object({ usage: z.string() }), handler: async () => ok({ result: "ok" }) }); }\n',
	});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"--json-schema",
	]);
	const document = JSON.parse(run.stdout) as {
		machineEnvelopeJsonSchema: { anyOf: readonly Record<string, unknown>[] };
	};
	expect(document.machineEnvelopeJsonSchema.anyOf).toHaveLength(7);
	expect(run.stdout).toContain('"const": "success"');
	expect(run.stdout).toContain('"const": "negative"');
	expect(run.stdout).toContain('"const": "failure"');
	expect(run.stdout).toContain('"const": "usage-error"');
	expect(run.stdout).toContain('"commanderCode"');
	expect(run.stdout).toContain('"issues"');
});

test("bodyless success omits data from JSON", async () => {
	const commandDirectory = await createCommandDirectory({});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"--format=json",
	]);
	expect(JSON.parse(run.stdout)).toEqual({ status: "success", exitCode: 0 });
});

const emptySchema = z.object({});
const stringSchema = z.string();

for (const [label, definition] of [
	["success", { schema: emptySchema, resultSchema: stringSchema, handler: async () => ok() }],
	[
		"negative",
		{
			schema: emptySchema,
			negativeSchema: stringSchema,
			handler: async () => negative("no"),
		},
	],
	[
		"failure",
		{
			schema: emptySchema,
			failureSchema: stringSchema,
			handler: async () => failure("failed", "failed"),
		},
	],
	[
		"usage error",
		{
			schema: emptySchema,
			usageErrorSchema: stringSchema,
			handler: async () => usageError("invalid"),
		},
	],
] as const) {
	test(`configured ${label} outcomes reject missing data`, async () => {
		const commandDirectory = await createCommandDirectory({});
		const app = createClinkrApp({ name: "fixture", commandDirectory });
		Object.defineProperty(app, "loaded", { value: Promise.resolve(definition) });
		await expect(app.run([])).rejects.toThrow("requires data for its status schema");
	});
}

test("bodyless outcomes reject undeclared data", async () => {
	const commandDirectory = await createCommandDirectory({});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	Object.defineProperty(app, "loaded", {
		value: Promise.resolve({ schema: emptySchema, handler: async () => ok("data") }),
	});
	await expect(app.run([])).rejects.toThrow("outcome data requires its status schema");
});

test.each(["yaml", "markdown", "JSON"])(
	"rejects format value %s from the exact domain",
	async (format) => {
		const commandDirectory = await createCommandDirectory({});
		const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
			`--format=${format}`,
		]);
		expect(run).toMatchObject({ exitCode: 2, stdout: "" });
		expect(run.stderr).toContain("invalid format");
	},
);

function isCounterModule(value: unknown): value is { counter: { handlerCalls: number } } {
	if (typeof value !== "object" || value === null || !("counter" in value)) return false;
	const counter = value.counter;
	return (
		typeof counter === "object" &&
		counter !== null &&
		"handlerCalls" in counter &&
		typeof counter.handlerCalls === "number"
	);
}
