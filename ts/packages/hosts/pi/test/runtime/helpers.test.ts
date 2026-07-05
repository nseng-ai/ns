import { describe, expect, test } from "vitest";

import {
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
} from "@nseng-ai/foundation/exec";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";

import { parseMachineEnvelopeData } from "../../src/runtime/machine-envelope.ts";

describe("pi extension runtime helpers", () => {
	test("formats command displays with shell quoting", () => {
		expect(formatCommand("ccc", ["exec", "cmux-workspace-summary", "--title", "hello world"])).toBe(
			"ccc exec cmux-workspace-summary --title 'hello world'",
		);
	});

	test("parses successful machine-envelope data", () => {
		expect(
			parseMachineEnvelopeData(
				JSON.stringify({ status: "ok", exitCode: 0, data: { success: true } }),
				{
					label: "example JSON",
				},
			),
		).toEqual({
			type: "valid",
			data: { success: true },
		});
	});

	test("parses failure machine-envelope data", () => {
		expect(
			parseMachineEnvelopeData(
				JSON.stringify({ exitCode: 3, errorType: "no-available-slot", message: "No slot." }),
				{ label: "example JSON" },
			),
		).toEqual({
			type: "failure",
			exitCode: 3,
			errorType: "no-available-slot",
			cliMessage: "No slot.",
			message: "example JSON reported failure: exitCode 3: errorType no-available-slot: No slot.",
		});
	});

	test("formats exec failures with the canonical command dialect", () => {
		const result = { stdout: "", stderr: "boom", code: 2, killed: false };
		expect(
			formatCommandFailure("objective command failed", "objective list", result).startsWith(
				"objective command failed (exit code 2).",
			),
		).toBe(true);
		expect(
			formatCommandStartupFailure(
				"objective command failed",
				"objective list",
				new Error("missing"),
			).startsWith("objective command failed (failed before completion)."),
		).toBe(true);
	});

	test("strips terminal escapes", () => {
		expect(stripTerminalEscapes("\u001b[31mred\u001b[0m")).toBe("red");
	});
});
