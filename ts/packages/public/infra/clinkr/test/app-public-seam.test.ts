import path from "node:path";

import { expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { runForTest } from "@nseng-ai/clinkr/app/testing";
import { app } from "./fixtures/readme-greet/app.ts";

// Every app below is built over a committed fixture directory, so the real
// loader runs once per fixture and the modules stay in the shared Vitest
// module cache. Loader-contract tests that need freshly written malformed
// modules live in test/integration/app-module-contract.test.ts.
const FIXTURES_DIRECTORY = path.join(import.meta.dirname, "fixtures");

function fixtureApp(name: string) {
	return createClinkrApp({
		name: "fixture",
		commandDirectory: path.join(FIXTURES_DIRECTORY, name),
	});
}

const argvProjectionApp = fixtureApp("argv-projection");
const countingApp = fixtureApp("counting");
const echoOutcomeApp = fixtureApp("echo-outcome");
const typedResultApp = fixtureApp("typed-result");
const misbehavingApp = fixtureApp("misbehaving");
const schemaPolicyApp = fixtureApp("schema-policy");
const refinedApp = fixtureApp("refined");

// Fixture module state is shared across tests (`isolate: false`), so counter
// reads use the same dynamic-import resolution as the app's own loader and
// tests assert deltas, never absolutes.
async function handlerCalls(): Promise<number> {
	const counterModule: unknown = await import(
		path.join(FIXTURES_DIRECTORY, "counting", "counter.ts")
	);
	if (!isCounterModule(counterModule)) throw new Error("Malformed counting fixture module");
	return counterModule.counter.handlerCalls;
}

test("a plain invocation runs the handler exactly once (fixture-cache control)", async () => {
	const before = await handlerCalls();
	const run = await runForTest(countingApp, []);
	expect(run.exitCode).toBe(0);
	expect((await handlerCalls()) - before).toBe(1);
});

test.each([["--help"], ["--json-schema"], ["--unknown"]])(
	"%s neither reads stdin nor invokes the handler",
	async (flag) => {
		let stdinReads = 0;
		const before = await handlerCalls();
		const run = await runForTest(countingApp, [flag], {
			io: {
				stdout: () => {},
				stderr: () => {},
				readStdin: async () => {
					stdinReads += 1;
					return "{}";
				},
			},
		});
		expect(run.exitCode).toBe(flag === "--unknown" ? 2 : 0);
		expect({ stdinReads, handlerCallsDelta: (await handlerCalls()) - before }).toEqual({
			stdinReads: 0,
			handlerCallsDelta: 0,
		});
	},
);

test("JSON Schema exposes the unified four-arm envelope union", async () => {
	const run = await runForTest(await app(), ["--json-schema"]);
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
	const run = await runForTest(countingApp, ["--format=json"]);
	expect(JSON.parse(run.stdout)).toEqual({ status: "success", exitCode: 0 });
});

test("runForTest captures while teeing custom I/O exactly once", async () => {
	const stdoutWrites: string[] = [];
	const stderrWrites: string[] = [];
	const run = await runForTest(echoOutcomeApp, ["--input-json"], {
		stdin: '{"outcome":{"status":"failure","errorType":"failed","message":"boom"}}',
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
	let suppliedStdinReads = 0;
	const caps = {
		isTty: true,
		colorDepth: "ansi16" as const,
		columns: 120,
		canRenderUnicode: true,
	};
	const run = await runForTest(typedResultApp, ["--input-json"], {
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
	});
	expect(run).toEqual({ exitCode: 0, stdout: "ansi:EXPLICIT\n", stderr: "" });
	expect(suppliedStdinReads).toBe(0);
});

test("success data is decoded through resultSchema before rendering", async () => {
	const run = await runForTest(typedResultApp, []);
	expect(run).toMatchObject({ exitCode: 0, stdout: "plain:ADA\n", stderr: "" });
});

test("success data that fails resultSchema decoding is a programmer error", async () => {
	await expect(runForTest(misbehavingApp, ["--mode", "bad-result"])).rejects.toThrow();
});

test("success without resultSchema rejects a data payload", async () => {
	await expect(
		runForTest(echoOutcomeApp, ["--input-json"], {
			stdin: '{"outcome":{"status":"success","data":"data"}}',
		}),
	).rejects.toThrow("success outcome data requires a resultSchema");
});

for (const [label, outcome, status, expectedData, exitCode] of [
	[
		"negative",
		{ status: "negative", message: "no", data: { anything: [1, "x"] } },
		"negative",
		{ anything: [1, "x"] },
		1,
	],
	[
		"failure",
		{ status: "failure", errorType: "failed", message: "failed", data: "freeform" },
		"failure",
		"freeform",
		2,
	],
	[
		"usage error",
		{ status: "usage-error", errorType: "usage-error", message: "invalid", data: [true] },
		"usage-error",
		[true],
		2,
	],
] as const) {
	test(`${label} data passes through to the envelope unvalidated`, async () => {
		const run = await runForTest(echoOutcomeApp, ["--input-json", "--format=json"], {
			stdin: JSON.stringify({ outcome }),
		});
		expect(run.exitCode).toBe(exitCode);
		expect(JSON.parse(run.stdout)).toMatchObject({ status, data: expectedData });
	});
}

for (const [label, outcome, exitCode] of [
	["success", { status: "success" }, 0],
	["negative", { status: "negative", message: "no" }, 1],
	["failure", { status: "failure", errorType: "failed", message: "failed" }, 2],
	["usage error", { status: "usage-error", errorType: "usage-error", message: "invalid" }, 2],
] as const) {
	test(`undefined ${label} data is omitted from the envelope`, async () => {
		const run = await runForTest(echoOutcomeApp, ["--input-json", "--format=json"], {
			stdin: JSON.stringify({ outcome }),
		});
		expect(run.exitCode).toBe(exitCode);
		expect(run.stdout).not.toContain('"data"');
	});
}

test("rendering falls back through Markdown, human, then indented JSON", async () => {
	const markdownRun = await runForTest(typedResultApp, ["--format=md"]);
	expect(markdownRun.stdout).toBe("plain:ADA\n");

	const fallbackRun = await runForTest(misbehavingApp, ["--mode", "ok"]);
	expect(fallbackRun.stdout).toBe('{\n  "value": "Ada"\n}\n');
});

test.each([
	["null", null],
	["an unknown status", { status: "other" }],
	["a missing required field", { status: "negative" }],
	["an extra field", { status: "negative", message: "no", extra: true }],
] as const)("malformed handler outcome (%s) is a programmer error", async (_label, outcome) => {
	await expect(
		runForTest(echoOutcomeApp, ["--input-json"], { stdin: JSON.stringify({ outcome }) }),
	).rejects.toThrow();
});

test("unexpected handler exceptions propagate", async () => {
	await expect(runForTest(misbehavingApp, ["--mode", "throw"])).rejects.toThrow("boom");
});

test.each(["null", "[]", '"Ada"', "1", "true"])(
	"JSON input rejects non-object transport value %s",
	async (stdin) => {
		const run = await runForTest(countingApp, ["--input-json", "--format=json"], { stdin });
		expect(run.exitCode).toBe(2);
		expect(JSON.parse(run.stdout)).toMatchObject({
			status: "usage-error",
			errorType: "invalid-json-input",
		});
	},
);

test("JSON input applies defaults and transforms while preserving nested schema policy", async () => {
	const run = await runForTest(schemaPolicyApp, ["--input-json"], {
		stdin: '{"nested":{"value":1,"preserved":true}}',
	});
	const supportModule: unknown = await import(
		path.join(FIXTURES_DIRECTORY, "schema-policy", "support.ts")
	);
	if (!isRequestObserverModule(supportModule)) throw new Error("Malformed request observer module");
	expect(run.exitCode).toBe(0);
	expect(supportModule.requests.at(-1)).toEqual({
		name: "ADA",
		nested: { value: 1, preserved: true },
	});
});

test("JSON input rejects top-level unknown keys with schema issues", async () => {
	const run = await runForTest(schemaPolicyApp, ["--input-json", "--format=json"], {
		stdin: '{"name":"Ada","nested":{"value":1},"unknown":true}',
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

test("JSON input enforces object-level refinements like the argv transport", async () => {
	const argvRun = await runForTest(refinedApp, ["--format=json"]);
	expect(argvRun.exitCode).toBe(2);
	expect(JSON.parse(argvRun.stdout)).toMatchObject({
		status: "usage-error",
		errorType: "invalid-request",
	});
	const jsonRun = await runForTest(refinedApp, ["--input-json", "--format=json"], { stdin: "{}" });
	expect(jsonRun.exitCode).toBe(2);
	expect(JSON.parse(jsonRun.stdout)).toMatchObject({
		status: "usage-error",
		errorType: "invalid-request",
	});
});

test("-- passes command arguments that look like global flags through verbatim", async () => {
	const run = await runForTest(await app(), ["--", "--format"]);
	expect(run).toEqual({ exitCode: 0, stdout: "Hello, --format.\n", stderr: "" });
});

test("--help after -- does not trigger help", async () => {
	const run = await runForTest(await app(), ["--", "--help"]);
	expect(run).toEqual({ exitCode: 0, stdout: "Hello, --help.\n", stderr: "" });
});

test("global flags before -- still apply", async () => {
	const run = await runForTest(await app(), ["--format", "json", "--", "--weird"]);
	expect(run.exitCode).toBe(0);
	expect(JSON.parse(run.stdout)).toEqual({
		status: "success",
		exitCode: 0,
		data: { message: "Hello, --weird." },
	});
});

test.each([
	["long", ["Ada", "src", "test", "--limit", "5"]],
	["short", ["Ada", "src", "test", "-n", "5"]],
] as const)(
	"argv projection coerces %s numeric options and variadic positionals",
	async (_label, argv) => {
		const run = await runForTest(argvProjectionApp, argv);
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({
			query: "Ada",
			paths: ["src", "test"],
			limit: 5,
			mode: "exact",
			tag: [],
		});
	},
);

test("argv projection accumulates repeated options and enforces enum choices", async () => {
	const run = await runForTest(argvProjectionApp, [
		"Ada",
		"src",
		"--tag",
		"one",
		"--tag",
		"two",
		"--mode",
		"fuzzy",
	]);
	expect(run.exitCode).toBe(0);
	expect(JSON.parse(run.stdout)).toMatchObject({ mode: "fuzzy", tag: ["one", "two"] });

	const invalid = await runForTest(argvProjectionApp, ["Ada", "src", "--mode", "broad"]);
	expect(invalid.exitCode).toBe(2);
	expect(invalid.stderr).toContain("Allowed choices are exact, fuzzy");
});

test.each(["five", "1.5", "+5", " 5"])(
	"invalid integer %j is a usage error and does not invoke the handler",
	async (value) => {
		const run = await runForTest(argvProjectionApp, ["Ada", "src", "--limit", value]);
		expect(run.exitCode).toBe(2);
		expect(run.stderr).toContain("expected an integer");
	},
);

test("--help renders annotation descriptions and default text", async () => {
	const run = await runForTest(argvProjectionApp, ["--help"]);
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("Search query.");
	expect(run.stdout).toContain("Paths to search.");
	expect(run.stdout).toContain("Maximum matches. (default: 20)");
	expect(run.stdout).toContain('Matching mode. (default: "exact")');
	expect(run.stdout).toContain("Tag filter. (default: [])");
});

test("--help renders the command metadata description, summary handling, and aliases", async () => {
	// Commander v14 renders `.summary()` only in a PARENT command's subcommand
	// listing, never in a root command's own helpInformation(); `.aliases()`
	// render in the root usage line. Both are wired onto the Command object;
	// only what commander actually renders is asserted here.
	const run = await runForTest(countingApp, ["--help"]);
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("Usage: fixture|fx");
	expect(run.stdout).toContain("Fixture command.");
	expect(run.stdout).not.toContain("Fixture summary.");
});

test("--help wins over an invalid --format value", async () => {
	const run = await runForTest(countingApp, ["--help", "--format", "bogus"]);
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("Usage: fixture");
	expect(run.stderr).toBe("");
});

test("-h wins over repeated --input-json", async () => {
	const run = await runForTest(countingApp, ["-h", "--input-json", "--input-json"]);
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("Usage: fixture");
	expect(run.stderr).toBe("");
});

test.each([[["--json-schema", "--input-json"]], [["--input-json", "--json-schema"]]])(
	"--json-schema combined with --input-json is a usage error (%j)",
	async (argv) => {
		const run = await runForTest(countingApp, [...argv, "--format=json"], { stdin: "{}" });
		expect(run.exitCode).toBe(2);
		expect(JSON.parse(run.stdout)).toMatchObject({
			status: "usage-error",
			errorType: "invalid-request",
		});
	},
);

test("repeated --format stays a usage error when help is not requested", async () => {
	const run = await runForTest(countingApp, ["--format=json", "--format=json"]);
	expect(run).toMatchObject({ exitCode: 2, stdout: "" });
	expect(run.stderr).toContain("repeated --format");
});

test("--format without a value stays a usage error", async () => {
	const run = await runForTest(countingApp, ["--format"]);
	expect(run).toMatchObject({ exitCode: 2, stdout: "" });
	expect(run.stderr).toContain("argument missing");
});

test("repeated --input-json without help stays a usage error", async () => {
	const run = await runForTest(countingApp, ["--input-json", "--input-json", "--format=json"], {
		stdin: "{}",
	});
	expect(run.exitCode).toBe(2);
	expect(JSON.parse(run.stdout)).toMatchObject({
		status: "usage-error",
		errorType: "invalid-request",
	});
});

test.each(["yaml", "markdown", "JSON"])(
	"rejects format value %s from the exact domain",
	async (format) => {
		const run = await runForTest(countingApp, [`--format=${format}`]);
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
