import { describe, expect, test } from "bun:test";

import { formatCommand, formatExecFailure, formatExecStartupFailure, parseMachineEnvelopeData, stripTerminalEscapes } from "../src/index.ts";

describe("pi extension runtime helpers", () => {
	test("formats command displays with shell quoting", () => {
		expect(formatCommand("asdl", ["exec", "cmux-workspace-summary", "--title", "hello world"])).toBe(
			"asdl exec cmux-workspace-summary --title 'hello world'",
		);
	});

	test("parses successful machine-envelope data", () => {
		expect(parseMachineEnvelopeData(JSON.stringify({ exit_code: 0, data: { success: true } }), { label: "example JSON" })).toEqual({
			type: "valid",
			data: { success: true },
		});
	});

	test("formats exec failures with an optional command subject", () => {
		const result = { stdout: "", stderr: "boom", code: 2, killed: false };
		expect(formatExecFailure("objective list", result, { subject: "objective command" }).startsWith("objective command failed (exit code 2)."))
			.toBe(true);
		expect(formatExecStartupFailure("objective list", new Error("missing"), { subject: "objective command" }).startsWith("objective command failed before completion."))
			.toBe(true);
	});

	test("strips terminal escapes", () => {
		expect(stripTerminalEscapes("\u001b[31mred\u001b[0m")).toBe("red");
	});
});
