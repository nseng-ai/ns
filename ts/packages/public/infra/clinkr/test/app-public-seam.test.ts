import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, expect, test } from "vitest";
import { z } from "zod";

import { createClinkrApp, failure, negative, ok, usageError } from "@nseng-ai/clinkr/app";
import { runForTest } from "@nseng-ai/clinkr/app/testing";

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

test.each([["--help"], ["--json-schema"], ["--unknown"]])(
	"%s neither reads stdin nor invokes the handler",
	async (flag) => {
		let stdinReads = 0;
		const commandDirectory = await createCommandDirectory({
			commandSource:
				'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nimport { counter } from "./counter.ts";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => { counter.handlerCalls += 1; return ok(); } }); }\n',
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

test("JSON Schema exposes the unified four-arm envelope union", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({ name: z.string() }), resultSchema: z.object({ result: z.string() }), handler: async () => ok({ result: "ok" }) }); }\n',
	});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"--json-schema",
	]);
	const document = JSON.parse(run.stdout) as {
		machineEnvelopeJsonSchema: { anyOf: readonly Record<string, unknown>[] };
	};
	expect(document.machineEnvelopeJsonSchema.anyOf).toHaveLength(4);
	expect(run.stdout).toContain('"const": "success"');
	expect(run.stdout).toContain('"const": "negative"');
	expect(run.stdout).toContain('"const": "failure"');
	expect(run.stdout).toContain('"const": "usage-error"');
});

test("bodyless success omits data from JSON", async () => {
	const commandDirectory = await createCommandDirectory({});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"--format=json",
	]);
	expect(JSON.parse(run.stdout)).toEqual({ status: "success", exitCode: 0 });
});

const emptySchema = z.object({});

test("success data is validated against resultSchema", async () => {
	const commandDirectory = await createCommandDirectory({});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	Object.defineProperty(app, "loaded", {
		value: Promise.resolve({
			schema: emptySchema,
			resultSchema: z.object({ value: z.string() }),
			handler: async () => ok({ value: 1 }),
		}),
	});
	await expect(app.run([])).rejects.toThrow();
});

test("success without resultSchema rejects a data payload", async () => {
	const commandDirectory = await createCommandDirectory({});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	Object.defineProperty(app, "loaded", {
		value: Promise.resolve({ schema: emptySchema, handler: async () => ok("data") }),
	});
	await expect(app.run([])).rejects.toThrow("success outcome data requires a resultSchema");
});

for (const [label, outcome, exitCode] of [
	["negative", negative("no", { data: { anything: [1, "x"] } }), 1],
	["failure", failure("failed", "failed", "freeform"), 2],
	["usage error", usageError("invalid", [true]), 2],
] as const) {
	test(`${label} data passes through to the envelope unvalidated`, async () => {
		const commandDirectory = await createCommandDirectory({});
		const app = createClinkrApp({ name: "fixture", commandDirectory });
		Object.defineProperty(app, "loaded", {
			value: Promise.resolve({ schema: emptySchema, handler: async () => outcome }),
		});
		const run = await runForTest(app, ["--format=json"]);
		expect(run.exitCode).toBe(exitCode);
		expect(JSON.parse(run.stdout)).toMatchObject({ status: outcome.status, data: outcome.data });
	});
}

for (const [label, outcome, exitCode] of [
	["success", ok(), 0],
	["negative", negative("no", { data: undefined }), 1],
	["failure", failure("failed", "failed", undefined), 2],
	["usage error", usageError("invalid", undefined), 2],
] as const) {
	test(`undefined ${label} data is omitted from the envelope`, async () => {
		const commandDirectory = await createCommandDirectory({});
		const app = createClinkrApp({ name: "fixture", commandDirectory });
		Object.defineProperty(app, "loaded", {
			value: Promise.resolve({ schema: emptySchema, handler: async () => outcome }),
		});
		const run = await runForTest(app, ["--format=json"]);
		expect(run.exitCode).toBe(exitCode);
		expect(run.stdout).not.toContain('"data"');
	});
}

test.each(["null", "[]", '"Ada"', "1", "true"])(
	"JSON input rejects non-object transport value %s",
	async (stdin) => {
		const commandDirectory = await createCommandDirectory({});
		const run = await runForTest(
			createClinkrApp({ name: "fixture", commandDirectory }),
			["--input-json", "--format=json"],
			{ stdin },
		);
		expect(run.exitCode).toBe(2);
		expect(JSON.parse(run.stdout)).toMatchObject({
			status: "usage-error",
			errorType: "invalid-json-input",
		});
	},
);

test("JSON input applies defaults and transforms while preserving nested schema policy", async () => {
	const commandDirectory = await createCommandDirectory({});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	let handledRequest: unknown;
	Object.defineProperty(app, "loaded", {
		value: Promise.resolve({
			schema: z
				.object({
					name: z
						.string()
						.default("Ada")
						.transform((name) => name.toUpperCase()),
					nested: z.object({ value: z.number() }).passthrough(),
				})
				.passthrough(),
			handler: async (request: unknown) => {
				handledRequest = request;
				return ok();
			},
		}),
	});
	const run = await runForTest(app, ["--input-json"], {
		stdin: '{"nested":{"value":1,"preserved":true}}',
	});
	expect(run.exitCode).toBe(0);
	expect(handledRequest).toEqual({
		name: "ADA",
		nested: { value: 1, preserved: true },
	});
});

test("JSON input rejects top-level unknown keys with schema issues", async () => {
	const commandDirectory = await createCommandDirectory({});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	Object.defineProperty(app, "loaded", {
		value: Promise.resolve({
			schema: z.object({ name: z.string() }).passthrough(),
			handler: async () => ok(),
		}),
	});
	const run = await runForTest(app, ["--input-json", "--format=json"], {
		stdin: '{"name":"Ada","unknown":true}',
	});
	const envelope = JSON.parse(run.stdout) as {
		errorType: string;
		data: { issues: readonly { code: string; keys?: readonly string[] }[] };
	};
	expect(run.exitCode).toBe(2);
	expect(envelope.errorType).toBe("invalid-request");
	expect(envelope.data.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ code: "unrecognized_keys", keys: ["unknown"] }),
		]),
	);
});

test("--help wins over an invalid --format value", async () => {
	const commandDirectory = await createCommandDirectory({});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"--help",
		"--format",
		"bogus",
	]);
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("Usage: fixture");
	expect(run.stderr).toBe("");
});

test("-h wins over repeated --input-json", async () => {
	const commandDirectory = await createCommandDirectory({});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"-h",
		"--input-json",
		"--input-json",
	]);
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("Usage: fixture");
	expect(run.stderr).toBe("");
});

test.each([[["--json-schema", "--input-json"]], [["--input-json", "--json-schema"]]])(
	"--json-schema combined with --input-json is a usage error (%j)",
	async (argv) => {
		const commandDirectory = await createCommandDirectory({});
		const run = await runForTest(
			createClinkrApp({ name: "fixture", commandDirectory }),
			[...argv, "--format=json"],
			{ stdin: "{}" },
		);
		expect(run.exitCode).toBe(2);
		expect(JSON.parse(run.stdout)).toMatchObject({
			status: "usage-error",
			errorType: "invalid-request",
		});
	},
);

test("repeated --format stays a usage error when help is not requested", async () => {
	const commandDirectory = await createCommandDirectory({});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"--format=json",
		"--format=json",
	]);
	expect(run).toMatchObject({ exitCode: 2, stdout: "" });
	expect(run.stderr).toContain("repeated --format");
});

test("--format without a value stays a usage error", async () => {
	const commandDirectory = await createCommandDirectory({});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
		"--format",
	]);
	expect(run).toMatchObject({ exitCode: 2, stdout: "" });
	expect(run.stderr).toContain("argument missing");
});

test("repeated --input-json without help stays a usage error", async () => {
	const commandDirectory = await createCommandDirectory({});
	const run = await runForTest(
		createClinkrApp({ name: "fixture", commandDirectory }),
		["--input-json", "--input-json", "--format=json"],
		{ stdin: "{}" },
	);
	expect(run.exitCode).toBe(2);
	expect(JSON.parse(run.stdout)).toMatchObject({
		status: "usage-error",
		errorType: "invalid-request",
	});
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
