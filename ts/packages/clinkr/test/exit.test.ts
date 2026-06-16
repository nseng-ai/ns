import { describe, expect, test } from "vitest";

import {
	envelopeJsonText,
	exitCodeForExit,
	failure,
	negative,
	ok,
	toMachineEnvelope,
	type ClinkrExit,
} from "../src/exit.ts";

describe("failure", () => {
	test("builds a failure exit with errorType and message", () => {
		expect(failure("missing_branch", "branch not found")).toEqual({
			type: "failure",
			errorType: "missing_branch",
			message: "branch not found",
		});
	});

	test("maps to exit code 2", () => {
		expect(exitCodeForExit(failure("boom", "bad"))).toBe(2);
	});

	test("produces the same machine envelope as a hand-built failure exit", () => {
		const handBuilt: ClinkrExit<never> = {
			type: "failure",
			errorType: "missing_branch",
			message: "branch not found",
		};
		expect(toMachineEnvelope(failure("missing_branch", "branch not found"))).toEqual(
			toMachineEnvelope(handBuilt),
		);
	});
});

describe("exitCodeForExit", () => {
	test("ok maps to 0", () => {
		expect(exitCodeForExit(ok({ value: 1 }))).toBe(0);
	});

	test("negative maps to 0 by default", () => {
		expect(exitCodeForExit(negative("nothing to do"))).toBe(0);
	});

	test("negative maps to 1 in shell exit code mode", () => {
		expect(exitCodeForExit(negative("nothing to do"), { shellExitCode: true })).toBe(1);
	});

	test("failure maps to 2", () => {
		const exit: ClinkrExit<never> = { type: "failure", errorType: "boom", message: "bad" };
		expect(exitCodeForExit(exit)).toBe(2);
	});
});

describe("toMachineEnvelope", () => {
	test("ok envelope carries exit_code and data only", () => {
		const envelope = toMachineEnvelope(ok({ name: "x" }));
		expect(envelope).toEqual({ exit_code: 0, data: { name: "x" } });
		expect(Object.keys(envelope)).toEqual(["exit_code", "data"]);
	});

	test("negative envelope without data omits the data key and exits 0 by default", () => {
		const envelope = toMachineEnvelope(negative("no plans found"));
		expect(envelope).toEqual({ exit_code: 0, message: "no plans found" });
		expect(Object.keys(envelope)).toEqual(["exit_code", "message"]);
	});

	test("negative envelope uses exit_code 1 in shell exit code mode", () => {
		const envelope = toMachineEnvelope(negative("no plans found"), { shellExitCode: true });
		expect(envelope).toEqual({ exit_code: 1, message: "no plans found" });
		expect(Object.keys(envelope)).toEqual(["exit_code", "message"]);
	});

	test("negative envelope with data orders keys exit_code, message, data", () => {
		const envelope = toMachineEnvelope(negative("empty", { count: 0 }));
		expect(Object.keys(envelope)).toEqual(["exit_code", "message", "data"]);
		expect(envelope.data).toEqual({ count: 0 });
	});

	test("failure envelope orders keys exit_code, error_type, message", () => {
		const exit: ClinkrExit<never> = {
			type: "failure",
			errorType: "missing_branch",
			message: "branch not found",
		};
		const envelope = toMachineEnvelope(exit);
		expect(envelope).toEqual({
			exit_code: 2,
			error_type: "missing_branch",
			message: "branch not found",
		});
		expect(Object.keys(envelope)).toEqual(["exit_code", "error_type", "message"]);
	});
});

describe("envelopeJsonText", () => {
	test("serializes like Python json.dumps(value, indent=2)", () => {
		const exit: ClinkrExit<never> = { type: "failure", errorType: "boom", message: "bad" };
		const text = envelopeJsonText(toMachineEnvelope(exit));
		expect(text).toBe(
			'{\n  "exit_code": 2,\n  "error_type": "boom",\n  "message": "bad"\n}',
		);
	});

	test("escapes non-ASCII characters like ensure_ascii", () => {
		expect(envelopeJsonText({ name: "héllo — café" })).toBe(
			'{\n  "name": "h\\u00e9llo \\u2014 caf\\u00e9"\n}',
		);
	});

	test("nested data serializes with two-space indentation", () => {
		const envelope = toMachineEnvelope(ok({ items: ["a"], total: 1 }));
		expect(envelopeJsonText(envelope)).toBe(
			'{\n  "exit_code": 0,\n  "data": {\n    "items": [\n      "a"\n    ],\n    "total": 1\n  }\n}',
		);
	});
});
