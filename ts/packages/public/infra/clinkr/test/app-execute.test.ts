import path from "node:path";

import { expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";

// execute() is the typed host seam: always schema-validated request objects
// in, decoded outcomes plus lazy rendered views out. Apps are built over the
// same committed fixture directories as the terminal-adapter behavior matrix
// in app-public-seam.test.ts.
const FIXTURES_DIRECTORY = path.join(import.meta.dirname, "fixtures");

function fixtureApp(name: string) {
	return createClinkrApp({
		name: "fixture",
		commandDirectory: path.join(FIXTURES_DIRECTORY, name),
	});
}

const countingApp = fixtureApp("counting");
const typedResultApp = fixtureApp("typed-result");
const misbehavingApp = fixtureApp("misbehaving");
const schemaPolicyApp = fixtureApp("schema-policy");
const refinedApp = fixtureApp("refined");
const echoOutcomeApp = fixtureApp("echo-outcome");
const rawTailApp = fixtureApp("raw-tail");
const contextfulGreetApp = createClinkrApp<{ readonly prefix: string }>({
	name: "contextful-greet",
	commandDirectory: path.join(FIXTURES_DIRECTORY, "contextful-greet"),
	requiresContext: true,
});

const PLAIN = { canEmitAnsi: false } as const;

test("execute validates the request through the full schema decode", async () => {
	const result = await typedResultApp.execute({});
	expect(result.outcome).toEqual({ status: "success", data: { name: "ADA" } });
	expect(result.exitCode).toBe(0);
});

test("execute rejects top-level unknown keys with precedence over field errors", async () => {
	const result = await schemaPolicyApp.execute({ name: 12, unknown: true });
	expect(result.exitCode).toBe(2);
	expect(result.outcome).toMatchObject({
		status: "usage-error",
		errorType: "invalid-request",
		data: {
			issues: [expect.objectContaining({ code: "unrecognized_keys", keys: ["unknown"] })],
		},
	});
});

test("execute enforces object-level refinements", async () => {
	const result = await refinedApp.execute({});
	expect(result.exitCode).toBe(2);
	expect(result.outcome).toMatchObject({
		status: "usage-error",
		errorType: "invalid-request",
	});
});

test.each([null, [], "Ada", 1, true])(
	"execute rejects non-object request %j as invalid-request",
	async (request) => {
		const result = await countingApp.execute(request);
		expect(result.exitCode).toBe(2);
		expect(result.outcome).toMatchObject({
			status: "usage-error",
			errorType: "invalid-request",
			message: "request must be a JSON object",
		});
	},
);

test("execute rejects raw commands as a programmer error", async () => {
	await expect(rawTailApp.execute({})).rejects.toThrow(
		"raw commands execute only through the terminal adapter",
	);
});

test("contextful execute requires a present context", async () => {
	// Deliberate TypeScript bypass standing in for JavaScript callers.
	const untypedApp: { execute(request: unknown, options?: object): Promise<unknown> } =
		contextfulGreetApp;
	await expect(untypedApp.execute({})).rejects.toThrow(
		"contextful command execution requires run options with context",
	);
	await expect(untypedApp.execute({}, { context: undefined })).rejects.toThrow(
		"contextful command execution requires run options with context",
	);
});

test("contextful execute passes the supplied context to the handler", async () => {
	const result = await contextfulGreetApp.execute({}, { context: { prefix: "Hi " } });
	expect(result.outcome).toEqual({ status: "success", data: { message: "Hi Ada" } });
});

test("render accessors apply the declared renderer with the supplied capabilities", async () => {
	const result = await typedResultApp.execute({ name: "grace" });
	expect(result.renderHuman(PLAIN)).toBe("plain:GRACE");
	expect(result.renderHuman({ canEmitAnsi: true })).toBe("ansi:GRACE");
});

test("renderMarkdown falls back to renderHuman and then indented JSON", async () => {
	const rendered = await typedResultApp.execute({});
	expect(rendered.renderMarkdown(PLAIN)).toBe("plain:ADA");

	const fallback = await misbehavingApp.execute({ mode: "ok" });
	expect(fallback.renderHuman(PLAIN)).toBe('{\n  "value": "Ada"\n}');
	expect(fallback.renderMarkdown(PLAIN)).toBe('{\n  "value": "Ada"\n}');
});

test("bodyless success renders nothing", async () => {
	const result = await countingApp.execute({});
	expect(result.outcome).toEqual({ status: "success" });
	expect(result.renderHuman(PLAIN)).toBeUndefined();
	expect(result.renderMarkdown(PLAIN)).toBeUndefined();
});

test("negative renders its message through the ANSI output boundary", async () => {
	const message = "\x1b[31mno\x1b[0m";
	const result = await echoOutcomeApp.execute({ outcome: { status: "negative", message } });
	expect(result.exitCode).toBe(1);
	expect(result.renderHuman(PLAIN)).toBe("no");
	expect(result.renderHuman({ canEmitAnsi: true })).toBe(message);
});

test.each([
	["failure", { status: "failure", errorType: "failed", message: "boom" }, 2],
	["usage error", { status: "usage-error", errorType: "usage-error", message: "invalid" }, 2],
] as const)(
	"%s outcomes render nothing; hosts use outcome.message",
	async (_label, outcome, exitCode) => {
		const result = await echoOutcomeApp.execute({ outcome });
		expect(result.exitCode).toBe(exitCode);
		expect(result.outcome).toEqual(outcome);
		expect(result.renderHuman(PLAIN)).toBeUndefined();
		expect(result.renderMarkdown(PLAIN)).toBeUndefined();
	},
);

test("malformed handler outcomes and handler exceptions propagate like run()", async () => {
	await expect(misbehavingApp.execute({ mode: "bad-result" })).rejects.toThrow();
	await expect(misbehavingApp.execute({ mode: "throw" })).rejects.toThrow("boom");
});

test("execute and the terminal adapter's json format agree on the envelope", async () => {
	const request = { name: "grace" };
	const executed = await typedResultApp.execute(request);
	const cliRun = await runForCliTest(typedResultApp, ["--input-json", "--format=json"], {
		stdin: JSON.stringify(request),
	});
	expect(JSON.parse(cliRun.stdout)).toEqual({
		status: "success",
		exitCode: executed.exitCode,
		data: executed.outcome.status === "success" ? executed.outcome.data : undefined,
	});
});

test("execute rejects a mismatched context mode like run()", async () => {
	const mismatchedApp = createClinkrApp({
		name: "mismatched",
		commandDirectory: path.join(FIXTURES_DIRECTORY, "contextful-greet"),
	});
	await expect(mismatchedApp.execute({})).rejects.toThrow(
		"selected command context mode does not match the app",
	);
});
