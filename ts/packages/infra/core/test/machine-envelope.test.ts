import { describe, expect, test } from "vitest";

import {
	parseMachineEnvelopeData,
	parseMachineEnvelopeDataWithFailureData,
} from "../src/machine-envelope.ts";

describe("parseMachineEnvelopeData", () => {
	test("parses a valid envelope with object data", () => {
		const result = parseMachineEnvelopeData(
			JSON.stringify({ status: "ok", exitCode: 0, data: { ok: true, count: 2 } }),
			{
				label: "test JSON",
			},
		);

		expect(result).toEqual({ type: "valid", data: { ok: true, count: 2 } });
	});

	test("rejects syntactically invalid JSON with the label", () => {
		expectInvalid(parseMachineEnvelopeData("{", { label: "test JSON" }), /Malformed test JSON/);
	});

	test("rejects a non-object envelope", () => {
		expectInvalid(
			parseMachineEnvelopeData("[]", { label: "test JSON" }),
			/expected an envelope object/,
		);
	});

	test("rejects missing or non-numeric exitCode", () => {
		for (const envelope of [{ data: {} }, { exitCode: "0", data: {} }]) {
			expectInvalid(
				parseMachineEnvelopeData(JSON.stringify(envelope), { label: "test JSON" }),
				/expected numeric exitCode/,
			);
		}
	});

	test("reports nonzero exitCode as a structured failure", () => {
		expect(
			parseMachineEnvelopeData(
				JSON.stringify({
					exitCode: 2,
					errorType: "command-failed",
					message: "command failed",
					data: {},
				}),
				{
					label: "test JSON",
				},
			),
		).toEqual({
			type: "failure",
			exitCode: 2,
			errorType: "command-failed",
			cliMessage: "command failed",
			message: "test JSON reported failure: exitCode 2: errorType command-failed: command failed.",
		});
	});

	test("rejects missing, null, array, or scalar data", () => {
		for (const data of [undefined, null, [], "value", 7]) {
			expectInvalid(
				parseMachineEnvelopeData(JSON.stringify({ exitCode: 0, data }), { label: "test JSON" }),
				/expected a data object/,
			);
		}
	});

	test("includes a bounded stdout tail when requested", () => {
		expectInvalid(
			parseMachineEnvelopeData("alpha\nbeta\ngamma", {
				label: "tail JSON",
				stdoutTail: { maxChars: 4, maxLines: 1 },
			}),
			/stdout tail:\n… 2 earlier line\(s\) omitted\n…amma/,
		);
	});
});

describe("parseMachineEnvelopeDataWithFailureData", () => {
	test("returns failure envelope data when explicitly allowed", () => {
		expect(
			parseMachineEnvelopeDataWithFailureData(
				JSON.stringify({
					status: "negative",
					exitCode: 1,
					message: "No PR",
					data: { markdown: "# Report" },
				}),
				{ label: "test JSON", shouldAllowFailureData: true },
			),
		).toEqual({ type: "valid", data: { markdown: "# Report" } });
	});

	test("does not hide invalid JSON when fallback parsing fails", () => {
		expectInvalid(
			parseMachineEnvelopeDataWithFailureData("not json", {
				label: "test JSON",
				shouldAllowFailureData: true,
			}),
			/Malformed test JSON/,
		);
	});
});

type MachineEnvelopeResult = ReturnType<
	typeof parseMachineEnvelopeData | typeof parseMachineEnvelopeDataWithFailureData
>;

function expectInvalid(result: MachineEnvelopeResult, pattern: RegExp): void {
	expect(result.type).toBe("invalid");
	if (result.type === "invalid") {
		expect(result.message).toMatch(pattern);
	}
}
