import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
	buildFailureMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	envelopeJsonText,
	exitCodeForExit,
	failure,
	machineEnvelopeSchema,
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

describe("machineEnvelopeSchema", () => {
	test("parses representative clinkr envelopes", () => {
		expect(machineEnvelopeSchema.parse({ exit_code: 0, data: { ok: true } })).toEqual({
			exit_code: 0,
			data: { ok: true },
		});
		expect(machineEnvelopeSchema.parse({ exit_code: 1, message: "nothing to do" })).toEqual({
			exit_code: 1,
			message: "nothing to do",
		});
		expect(machineEnvelopeSchema.parse({ exit_code: 2, error_type: "boom", message: "bad" })).toEqual({
			exit_code: 2,
			error_type: "boom",
			message: "bad",
		});
	});

	test("rejects noncanonical exit codes", () => {
		expect(machineEnvelopeSchema.safeParse({ exit_code: 3, message: "noncanonical" }).success).toBe(
			false,
		);
	});
});

describe("machine envelope schema builders", () => {
	test("builds strict success envelopes around a data schema", () => {
		const schema = buildSuccessMachineEnvelopeSchema(z.object({ value: z.number() }));

		expect(schema.parse({ exit_code: 0, data: { value: 1 } })).toEqual({ exit_code: 0, data: { value: 1 } });
		expect(schema.safeParse({ exit_code: 1, data: { value: 1 } }).success).toBe(false);
		expect(schema.safeParse({ exit_code: 0, data: { value: "1" } }).success).toBe(false);
		expect(schema.safeParse({ exit_code: 0, data: { value: 1 }, extra: true }).success).toBe(false);
	});

	test("builds strict failure envelopes with configurable validation", () => {
		const schema = buildFailureMachineEnvelopeSchema({
			errorTypeSchema: z.string().trim().min(1),
		});

		expect(schema.parse({ exit_code: 2, error_type: "boom", message: "bad" })).toEqual({ exit_code: 2, error_type: "boom", message: "bad" });
		expect(schema.parse({ exit_code: 1, error_type: "negative", message: "nothing to do" })).toEqual({ exit_code: 1, error_type: "negative", message: "nothing to do" });
		expect(schema.safeParse({ exit_code: 0, error_type: "boom", message: "bad" }).success).toBe(false);
		expect(schema.safeParse({ exit_code: 2, error_type: " ", message: "bad" }).success).toBe(false);
		expect(schema.safeParse({ exit_code: 2, error_type: "boom", message: "bad", data: {} }).success).toBe(false);
	});
});

describe("toMachineEnvelope", () => {
	test("ok envelope carries exit_code and data only", () => {
		const envelope = toMachineEnvelope(ok({ name: "x" }));
		expect(envelope).toEqual({ exit_code: 0, data: { name: "x" } });
		expect(Object.keys(envelope)).toEqual(["exit_code", "data"]);
	});

	test("negative envelope without data omits the data key and uses semantic exit_code 1", () => {
		const envelope = toMachineEnvelope(negative("no plans found"));
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

describe("machineEnvelopeSchema", () => {
	test("accepts the machine envelopes emitted by clinkr exits", () => {
		expect(machineEnvelopeSchema.parse(toMachineEnvelope(ok({ value: 1 })))).toEqual({ exit_code: 0, data: { value: 1 } });
		expect(machineEnvelopeSchema.parse(toMachineEnvelope(negative("nothing to do")))).toEqual({ exit_code: 1, message: "nothing to do" });
		expect(machineEnvelopeSchema.parse(toMachineEnvelope(failure("boom", "bad")))).toEqual({ exit_code: 2, error_type: "boom", message: "bad" });
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
