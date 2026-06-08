import { describe, expect, test } from "vitest";

import { parseMachineEnvelopeData } from "../src/machine-envelope.ts";

describe("parseMachineEnvelopeData", () => {
	test("parses a valid envelope with object data", () => {
		const result = parseMachineEnvelopeData(JSON.stringify({ exit_code: 0, data: { ok: true, count: 2 } }), {
			label: "test JSON",
		});

		expect(result).toEqual({ type: "valid", data: { ok: true, count: 2 } });
	});

	test("rejects syntactically invalid JSON with the label", () => {
		expectInvalid(parseMachineEnvelopeData("{", { label: "test JSON" }), /Malformed test JSON/);
	});

	test("rejects a non-object envelope", () => {
		expectInvalid(parseMachineEnvelopeData("[]", { label: "test JSON" }), /expected an envelope object/);
	});

	test("rejects missing or non-numeric exit_code", () => {
		for (const envelope of [{ data: {} }, { exit_code: "0", data: {} }]) {
			expectInvalid(
				parseMachineEnvelopeData(JSON.stringify(envelope), { label: "test JSON" }),
				/expected numeric exit_code/,
			);
		}
	});

	test("rejects nonzero exit_code and includes envelope message text", () => {
		expectInvalid(
			parseMachineEnvelopeData(JSON.stringify({ exit_code: 2, message: "command failed", data: {} }), {
				label: "test JSON",
			}),
			/exit_code 2[\s\S]*command failed/,
		);
	});

	test("rejects missing, null, array, or scalar data", () => {
		for (const data of [undefined, null, [], "value", 7]) {
			expectInvalid(
				parseMachineEnvelopeData(JSON.stringify({ exit_code: 0, data }), { label: "test JSON" }),
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
		for (const options of [{ label: "tail JSON" }, { label: "tail JSON", stdoutTail: false as const }]) {
			const result = parseMachineEnvelopeData("not json", options);

			expect(result.type).toBe("invalid");
			if (result.type === "invalid") {
				expect(result.message).toContain("Malformed tail JSON");
				expect(result.message).not.toContain("stdout tail");
			}
		}
	});
});

type MachineEnvelopeResult = ReturnType<typeof parseMachineEnvelopeData>;

function expectInvalid(result: MachineEnvelopeResult, pattern: RegExp): void {
	expect(result.type).toBe("invalid");
	if (result.type === "invalid") {
		expect(result.message).toMatch(pattern);
	}
}
