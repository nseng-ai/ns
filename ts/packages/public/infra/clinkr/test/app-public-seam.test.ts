import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
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
	readonly supportSource?: string;
}): Promise<string> {
	const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-public-seam-"));
	temporaryDirectories.push(directory);
	const files = [
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
	];
	if (input.supportSource !== undefined) {
		files.push(writeFile(path.join(directory, "support.ts"), input.supportSource));
	}
	await Promise.all(files);
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

test("runForTest captures while teeing custom I/O exactly once", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, failure } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => failure("failed", "boom") }); }\n',
	});
	const stdoutWrites: string[] = [];
	const stderrWrites: string[] = [];
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [], {
		io: {
			stdout: (text) => stdoutWrites.push(text),
			stderr: (text) => stderrWrites.push(text),
		},
	});
	expect(run).toEqual({ exitCode: 2, stdout: "", stderr: "boom\n" });
	expect(stdoutWrites).toEqual([]);
	expect(stderrWrites).toEqual(["boom\n"]);
});

test("runForTest preserves custom capabilities and explicit stdin precedence", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({ name: z.string() }), resultSchema: z.object({ name: z.string() }), renderHuman: (result, capabilities) => `${capabilities.canEmitAnsi ? "ansi" : "plain"}:${result.name}`, handler: async (request) => ok(request) }); }\n',
	});
	let suppliedStdinReads = 0;
	const caps = {
		isTty: true,
		colorDepth: "ansi16" as const,
		columns: 120,
		canRenderUnicode: true,
	};
	const run = await runForTest(
		createClinkrApp({ name: "fixture", commandDirectory }),
		["--input-json"],
		{
			stdin: '{"name":"explicit"}',
			io: {
				stdout: () => {},
				stderr: () => {},
				readStdin: async () => {
					suppliedStdinReads += 1;
					return '{"name":"supplied"}';
				},
				caps,
				canEmitAnsi: true,
			},
		},
	);
	expect(run).toEqual({ exitCode: 0, stdout: "ansi:explicit\n", stderr: "" });
	expect(suppliedStdinReads).toBe(0);
});

test("success data is decoded through resultSchema before rendering", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), resultSchema: z.object({ name: z.string().transform((name) => name.toUpperCase()) }), renderHuman: (result) => result.name, handler: async () => ok({ name: "Ada" }) }); }\n',
	});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), []);
	expect(run).toMatchObject({ exitCode: 0, stdout: "ADA\n", stderr: "" });
});

test("success data that fails resultSchema decoding is a programmer error", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), resultSchema: z.object({ value: z.string() }), handler: async () => ok({ value: 1 }) }); }\n',
	});
	await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow();
});

test("success without resultSchema rejects a data payload", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return { schema: z.object({}), handler: async () => ok("data") }; }\n',
	});
	await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow(
		"success outcome data requires a resultSchema",
	);
});

for (const [label, outcomeSource, status, expectedData, exitCode] of [
	[
		"negative",
		'negative("no", { data: { anything: [1, "x"] } })',
		"negative",
		{ anything: [1, "x"] },
		1,
	],
	["failure", 'failure("failed", "failed", "freeform")', "failure", "freeform", 2],
	["usage error", 'usageError("invalid", [true])', "usage-error", [true], 2],
] as const) {
	test(`${label} data passes through to the envelope unvalidated`, async () => {
		const commandDirectory = await createCommandDirectory({
			commandSource: `import { defineCommand, failure, negative, usageError } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => ${outcomeSource} }); }\n`,
		});
		const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
			"--format=json",
		]);
		expect(run.exitCode).toBe(exitCode);
		expect(JSON.parse(run.stdout)).toMatchObject({ status, data: expectedData });
	});
}

for (const [label, outcomeSource, exitCode] of [
	["success", "ok()", 0],
	["negative", 'negative("no")', 1],
	["failure", 'failure("failed", "failed", undefined)', 2],
	["usage error", 'usageError("invalid", undefined)', 2],
] as const) {
	test(`undefined ${label} data is omitted from the envelope`, async () => {
		const commandDirectory = await createCommandDirectory({
			commandSource: `import { defineCommand, failure, negative, ok, usageError } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => ${outcomeSource} }); }\n`,
		});
		const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), [
			"--format=json",
		]);
		expect(run.exitCode).toBe(exitCode);
		expect(run.stdout).not.toContain('"data"');
	});
}

test("rendering falls back through Markdown, human, then indented JSON", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), resultSchema: z.object({ name: z.string() }), renderHuman: (result) => `Hello ${result.name}`, handler: async () => ok({ name: "Ada" }) }); }\n',
	});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	const markdownRun = await runForTest(app, ["--format=md"]);
	expect(markdownRun.stdout).toBe("Hello Ada\n");

	const jsonFallbackDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), resultSchema: z.object({ name: z.string() }), handler: async () => ok({ name: "Ada" }) }); }\n',
	});
	const fallbackRun = await runForTest(
		createClinkrApp({ name: "fixture", commandDirectory: jsonFallbackDirectory }),
		[],
	);
	expect(fallbackRun.stdout).toBe('{\n  "name": "Ada"\n}\n');
});

test.each([
	["null", "null"],
	["an unknown status", '{ status: "other" }'],
	["a missing required field", '{ status: "negative" }'],
	["an extra field", '{ status: "negative", message: "no", extra: true }'],
] as const)(
	"malformed handler outcome (%s) is a programmer error",
	async (_label, outcomeSource) => {
		const commandDirectory = await createCommandDirectory({
			commandSource: `import { defineCommand } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => ${outcomeSource} }); }\n`,
		});
		await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow();
	},
);

test("unexpected handler exceptions propagate", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), handler: async () => { throw new Error("boom"); } }); }\n',
	});
	await expect(createClinkrApp({ name: "fixture", commandDirectory }).run([])).rejects.toThrow(
		"boom",
	);
});

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
	const commandDirectory = await createCommandDirectory({
		supportSource: "export const requests: unknown[] = [];\n",
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nimport { requests } from "./support.ts";\nexport async function command() { return defineCommand({ schema: z.object({ name: z.string().default("Ada").transform((name) => name.toUpperCase()), nested: z.object({ value: z.number() }).passthrough() }).passthrough(), handler: async (request) => { requests.push(request); return ok(); } }); }\n',
	});
	const run = await runForTest(
		createClinkrApp({ name: "fixture", commandDirectory }),
		["--input-json"],
		{ stdin: '{"nested":{"value":1,"preserved":true}}' },
	);
	const supportModule: unknown = await import(path.join(commandDirectory, "support.ts"));
	if (!isRequestObserverModule(supportModule)) throw new Error("Malformed request observer module");
	expect(run.exitCode).toBe(0);
	expect(supportModule.requests).toEqual([
		{
			name: "ADA",
			nested: { value: 1, preserved: true },
		},
	]);
});

test("JSON input rejects top-level unknown keys with schema issues", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({ name: z.string() }).passthrough(), handler: async () => ok() }); }\n',
	});
	const run = await runForTest(
		createClinkrApp({ name: "fixture", commandDirectory }),
		["--input-json", "--format=json"],
		{ stdin: '{"name":"Ada","unknown":true}' },
	);
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

test("JSON input enforces object-level refinements like the argv transport", async () => {
	const commandDirectory = await createCommandDirectory({
		commandSource:
			'import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.strictObject({ a: z.string().optional(), b: z.string().optional() }).refine((request) => request.a !== undefined || request.b !== undefined, { message: "a or b required" }), handler: async () => ok() }); }\n',
	});
	const app = createClinkrApp({ name: "fixture", commandDirectory });
	const argvRun = await runForTest(app, ["--format=json"]);
	expect(argvRun.exitCode).toBe(2);
	expect(JSON.parse(argvRun.stdout)).toMatchObject({
		status: "usage-error",
		errorType: "invalid-request",
	});
	const jsonRun = await runForTest(app, ["--input-json", "--format=json"], { stdin: "{}" });
	expect(jsonRun.exitCode).toBe(2);
	expect(JSON.parse(jsonRun.stdout)).toMatchObject({
		status: "usage-error",
		errorType: "invalid-request",
	});
});

test("--help renders the command metadata description", async () => {
	const commandDirectory = await createCommandDirectory({});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), ["--help"]);
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("Fixture command.");
});

test("--help renders the description when summary and aliases are declared", async () => {
	// Commander v14 renders `.summary()` only in a PARENT command's subcommand
	// listing, never in a root command's own helpInformation(); `.aliases()`
	// render in the root usage line. Both are wired onto the Command object;
	// only what commander actually renders is asserted here.
	const commandDirectory = await createCommandDirectory({
		metadataSource:
			'export function metadata() { return { description: "Fixture command.", summary: "Fixture summary.", aliases: ["fx"] }; }\n',
	});
	const run = await runForTest(createClinkrApp({ name: "fixture", commandDirectory }), ["--help"]);
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("Usage: fixture|fx");
	expect(run.stdout).toContain("Fixture command.");
	expect(run.stdout).not.toContain("Fixture summary.");
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

function isRequestObserverModule(value: unknown): value is { requests: unknown[] } {
	return (
		typeof value === "object" &&
		value !== null &&
		"requests" in value &&
		Array.isArray(value.requests)
	);
}

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
