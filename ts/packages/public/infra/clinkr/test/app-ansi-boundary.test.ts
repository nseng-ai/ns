import path from "node:path";

import { expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { runForTest } from "@nseng-ai/clinkr/app/testing";

// Framework-owned ANSI output boundary: `canEmitAnsi` is advisory to
// renderers, but Clinkr strips escapes before writing to a sink that cannot
// display them, even when a renderer ignores the capability.
const FIXTURES_DIRECTORY = path.join(import.meta.dirname, "fixtures");

const ansiAlwaysApp = createClinkrApp({
	name: "ansi-always",
	commandDirectory: path.join(FIXTURES_DIRECTORY, "ansi-always"),
});
const echoOutcomeApp = createClinkrApp({
	name: "echo-outcome",
	commandDirectory: path.join(FIXTURES_DIRECTORY, "echo-outcome"),
});

const STYLED_OUTPUT = "\x1b[31mstyled\x1b[0m \x1b]8;;https://example.invalid\x07link\x1b]8;;\x07";

test("a renderer that ignores capabilities cannot leak ANSI to a plain sink", async () => {
	const run = await runForTest(ansiAlwaysApp, []);
	expect(run).toEqual({ exitCode: 0, stdout: "styled link\n", stderr: "" });
});

test("the Markdown fallback path is stripped for plain sinks too", async () => {
	const run = await runForTest(ansiAlwaysApp, ["--format=md"]);
	expect(run.stdout).toBe("styled link\n");
});

test("ANSI-enabled sinks preserve renderer output byte-for-byte apart from the newline", async () => {
	const run = await runForTest(ansiAlwaysApp, [], {
		io: { stdout: () => {}, stderr: () => {}, canEmitAnsi: true },
	});
	expect(run.stdout).toBe(`${STYLED_OUTPUT}\n`);
});

test("JSON envelopes are untouched by the output-boundary strip", async () => {
	const run = await runForTest(ansiAlwaysApp, ["--format=json"]);
	expect(JSON.parse(run.stdout)).toEqual({
		status: "success",
		exitCode: 0,
		data: { value: "styled" },
	});
});

test("non-renderer outcome messages pass through unchanged on plain sinks", async () => {
	const message = "\x1b[31mno\x1b[0m";
	const run = await runForTest(echoOutcomeApp, ["--input-json"], {
		stdin: JSON.stringify({ outcome: { status: "negative", message } }),
	});
	expect(run).toEqual({ exitCode: 1, stdout: `${message}\n`, stderr: "" });
});
