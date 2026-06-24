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
					errorType: "command_failed",
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
			errorType: "command_failed",
			cliMessage: "command failed",
			message: "test JSON reported failure: exitCode 2: errorType command_failed: command failed.",
		});
	});

	test("includes errorType and stdout tail in failure messages", () => {
		const result = parseMachineEnvelopeData(
			JSON.stringify({ exitCode: 4, errorType: "no_slot", message: "No slot." }),
			{
				label: "test JSON",
				stdoutTail: { maxChars: 100, maxLines: 1 },
			},
		);

		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.message).toContain("errorType no_slot");
			expect(result.message).toContain("No slot.");
			expect(result.message).toContain("stdout tail:");
		}
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

	test("omits stdout tail when absent or explicitly false", () => {
		for (const options of [
			{ label: "tail JSON" },
			{ label: "tail JSON", stdoutTail: false as const },
		]) {
			const result = parseMachineEnvelopeData("not json", options);

			expect(result.type).toBe("invalid");
			if (result.type === "invalid") {
				expect(result.message).toContain("Malformed tail JSON");
				expect(result.message).not.toContain("stdout tail");
			}
		}
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

	test("keeps malformed-envelope errors when failure data is not allowed", () => {
		expectInvalid(
			parseMachineEnvelopeDataWithFailureData(
				JSON.stringify({
					status: "negative",
					exitCode: 1,
					message: "No PR",
					data: { markdown: "# Report" },
				}),
				{ label: "test JSON" },
			),
			/reported failure: exitCode 1/,
		);
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
