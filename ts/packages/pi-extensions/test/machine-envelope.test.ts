import { describe, expect, test } from "bun:test";

import { parseMachineEnvelopeData } from "../src/machine-envelope.ts";

describe("parseMachineEnvelopeData", () => {
	test("parses a valid envelope with object data", () => {
		const data = parseMachineEnvelopeData(JSON.stringify({ exit_code: 0, data: { ok: true, count: 2 } }), {
			label: "test JSON",
		});

		expect(data).toEqual({ ok: true, count: 2 });
	});

	test("rejects syntactically invalid JSON with the label", () => {
		expect(() => parseMachineEnvelopeData("{", { label: "test JSON" })).toThrow(/Malformed test JSON/);
	});

	test("rejects a non-object envelope", () => {
		expect(() => parseMachineEnvelopeData("[]", { label: "test JSON" })).toThrow(/expected an envelope object/);
	});

	test("rejects missing or non-numeric exit_code", () => {
		for (const envelope of [{ data: {} }, { exit_code: "0", data: {} }]) {
			expect(() => parseMachineEnvelopeData(JSON.stringify(envelope), { label: "test JSON" })).toThrow(
				/expected numeric exit_code/,
			);
		}
	});

	test("rejects nonzero exit_code and includes envelope message text", () => {
		expect(() =>
			parseMachineEnvelopeData(JSON.stringify({ exit_code: 2, message: "command failed", data: {} }), {
				label: "test JSON",
			}),
		).toThrow(/exit_code 2[\s\S]*command failed/);
	});

	test("rejects missing, null, array, or scalar data", () => {
		for (const data of [undefined, null, [], "value", 7]) {
			expect(() => parseMachineEnvelopeData(JSON.stringify({ exit_code: 0, data }), { label: "test JSON" })).toThrow(
				/expected a data object/,
			);
		}
	});

	test("includes a bounded stdout tail when requested", () => {
		expect(() =>
			parseMachineEnvelopeData("alpha\nbeta\ngamma", {
				label: "tail JSON",
				stdoutTail: { maxChars: 4, maxLines: 1 },
			}),
		).toThrow(/stdout tail:\n… 2 earlier line\(s\) omitted\n…amma/);
	});

	test("omits stdout tail when absent or explicitly false", () => {
		for (const options of [{ label: "tail JSON" }, { label: "tail JSON", stdoutTail: false as const }]) {
			let message = "";
			try {
				parseMachineEnvelopeData("not json", options);
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}

			expect(message).toContain("Malformed tail JSON");
			expect(message).not.toContain("stdout tail");
		}
	});
});
