import path from "node:path";

import { expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";
import { defineRawCommand } from "@nseng-ai/clinkr/raw";

// Raw selected-definition dispatch through the same committed-fixture loader
// path as the structured behavior matrix in app-public-seam.test.ts.
const FIXTURES_DIRECTORY = path.join(import.meta.dirname, "fixtures");

interface FixtureContext {
	readonly prefix: string;
}

const rawTailApp = createClinkrApp({
	name: "raw-tail",
	commandDirectory: path.join(FIXTURES_DIRECTORY, "raw-tail"),
});
const rawContextfulApp = createClinkrApp<FixtureContext>({
	name: "raw-contextful",
	commandDirectory: path.join(FIXTURES_DIRECTORY, "raw-contextful"),
	requiresContext: true,
});
const contextfulGreetApp = createClinkrApp<FixtureContext>({
	name: "contextful-greet",
	commandDirectory: path.join(FIXTURES_DIRECTORY, "contextful-greet"),
	requiresContext: true,
});

// Fixture module state is shared across tests (`isolate: false`), so counter
// reads use the same dynamic-import resolution as the app's own loader and
// tests assert deltas, never absolutes.
async function commandLoads(): Promise<number> {
	const loadsModule: unknown = await import(path.join(FIXTURES_DIRECTORY, "raw-tail", "loads.ts"));
	if (!isLoadsModule(loadsModule)) throw new Error("Malformed raw-tail loads module");
	return loadsModule.loads.commandCalls;
}

test("defineRawCommand owns the raw discriminant across an untyped boundary", () => {
	const conflictingDefinition = { type: "structured", run: () => 0 };
	const definition = defineRawCommand(conflictingDefinition);
	expect(definition.type).toBe("raw");
	expect(definition.run({ argv: [] })).toBe(0);
});

test("raw execution receives the argv tail verbatim and owns bytes and exit status", async () => {
	// Every structured global flag plus `--` flows through uninterpreted: no
	// help output, no schema document, no framework newline.
	const argv = ["a", "--format", "json", "--input-json", "--json-schema", "--help", "--", "-x"];
	const run = await runForCliTest(rawTailApp, argv);
	expect(run).toEqual({ exitCode: argv.length, stdout: JSON.stringify(argv), stderr: "" });
});

test("raw commands share the transactional loader cache with structured commands", async () => {
	const freshApp = createClinkrApp({
		name: "raw-tail-fresh",
		commandDirectory: path.join(FIXTURES_DIRECTORY, "raw-tail"),
	});
	const before = await commandLoads();
	const first = await runForCliTest(freshApp, []);
	const second = await runForCliTest(freshApp, ["x"]);
	expect(first.exitCode).toBe(0);
	expect(second.exitCode).toBe(1);
	expect((await commandLoads()) - before).toBe(1);
});

test("contextful raw execution receives the run context in its invocation object", async () => {
	const run = await runForCliTest(rawContextfulApp, ["a", "b"], { context: { prefix: "p" } });
	expect(run).toEqual({ exitCode: 0, stdout: "p:a,b", stderr: "" });
});

// Deliberate TypeScript bypass: method-position bivariance lets the typed
// apps flow into this untyped view, standing in for JavaScript callers.
interface UntypedApp {
	run(argv: readonly string[], options?: object): Promise<number>;
}

test("a contextful raw runner never receives an absent context", async () => {
	const untypedApp: UntypedApp = rawContextfulApp;
	await expect(untypedApp.run([])).rejects.toThrow(
		"contextful command execution requires run options with context",
	);
	await expect(untypedApp.run([], { context: undefined })).rejects.toThrow(
		"contextful command execution requires run options with context",
	);
});

test("a contextful structured handler never receives an absent context", async () => {
	const untypedApp: UntypedApp = contextfulGreetApp;
	await expect(untypedApp.run([])).rejects.toThrow(
		"contextful command execution requires run options with context",
	);
	await expect(untypedApp.run([], { context: undefined })).rejects.toThrow(
		"contextful command execution requires run options with context",
	);
});

test("contextful structured execution passes the run context to the handler", async () => {
	const run = await runForCliTest(contextfulGreetApp, [], { context: { prefix: "Hi " } });
	expect(run).toEqual({ exitCode: 0, stdout: '{\n  "message": "Hi Ada"\n}\n', stderr: "" });
});

test("a context-free app rejects a contextful raw definition", async () => {
	const mismatchedApp = createClinkrApp({
		name: "mismatched",
		commandDirectory: path.join(FIXTURES_DIRECTORY, "raw-contextful"),
	});
	await expect(runForCliTest(mismatchedApp, [])).rejects.toThrow(
		"selected command context mode does not match the app",
	);
});

test("a contextful app rejects a context-free raw definition", async () => {
	const mismatchedApp = createClinkrApp<FixtureContext>({
		name: "mismatched",
		commandDirectory: path.join(FIXTURES_DIRECTORY, "raw-tail"),
		requiresContext: true,
	});
	await expect(runForCliTest(mismatchedApp, [], { context: { prefix: "p" } })).rejects.toThrow(
		"selected command context mode does not match the app",
	);
});

function isLoadsModule(value: unknown): value is { loads: { commandCalls: number } } {
	if (typeof value !== "object" || value === null || !("loads" in value)) return false;
	const loads = value.loads;
	return (
		typeof loads === "object" &&
		loads !== null &&
		"commandCalls" in loads &&
		typeof loads.commandCalls === "number"
	);
}
