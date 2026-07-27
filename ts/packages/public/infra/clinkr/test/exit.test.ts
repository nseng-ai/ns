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
	negativeMachineEnvelopeSchema,
	ok,
	toMachineEnvelope,
	usageError,
	type ClinkrExit,
} from "../src/exit.ts";

describe("outcome constructors", () => {
	test("omit data from bodyless outcomes", () => {
		for (const outcome of [
			ok(),
			negative("no"),
			failure("failed", "failed"),
			usageError("invalid"),
		]) {
			expect(outcome).not.toHaveProperty("data");
		}
	});

	test("preserve explicitly undefined data by call and property presence", () => {
		for (const outcome of [
			ok(undefined),
			negative("no", { data: undefined }),
			failure("failed", "failed", undefined),
			usageError("invalid", undefined),
		]) {
			expect(outcome).toHaveProperty("data");
			expect("data" in outcome).toBe(true);
			if ("data" in outcome) expect(outcome.data).toBeUndefined();
		}
	});
});

describe("usageError", () => {
	test("builds a handler-reachable usage error exit", () => {
		expect(usageError("missing --yes", { missingFlag: "--yes" })).toEqual({
			type: "usageError",
			errorType: "usageError",
			message: "missing --yes",
			data: { missingFlag: "--yes" },
		});
	});

	test("maps to exit code 2", () => {
		expect(exitCodeForExit(usageError("missing flag"))).toBe(2);
	});
});

describe("failure", () => {
	test("builds a failure exit with errorType and message", () => {
		expect(failure("missing-branch", "branch not found")).toEqual({
			type: "failure",
			errorType: "missing-branch",
			message: "branch not found",
		});
	});

	test("maps to exit code 2", () => {
		expect(exitCodeForExit(failure("boom", "bad"))).toBe(2);
	});

	test("produces the same machine envelope as a hand-built failure exit", () => {
		const handBuilt: ClinkrExit<never> = {
			type: "failure",
			errorType: "missing-branch",
			message: "branch not found",
		};
		expect(toMachineEnvelope(failure("missing-branch", "branch not found"))).toEqual(
			toMachineEnvelope(handBuilt),
		);
	});
});

describe("exitCodeForExit", () => {
	test("ok maps to 0", () => {
		expect(exitCodeForExit(ok({ value: 1 }))).toBe(0);
	});

	test("negative maps to 1", () => {
		expect(exitCodeForExit(negative("nothing to do"))).toBe(1);
	});

	test("failure maps to 2", () => {
		const exit: ClinkrExit<never> = { type: "failure", errorType: "boom", message: "bad" };
		expect(exitCodeForExit(exit)).toBe(2);
	});
});

describe("machineEnvelopeSchema", () => {
	test("parses representative clinkr envelopes", () => {
		expect(machineEnvelopeSchema.parse({ status: "ok", exitCode: 0, data: { ok: true } })).toEqual({
			status: "ok",
			exitCode: 0,
			data: { ok: true },
		});
		expect(
			machineEnvelopeSchema.parse({ status: "negative", exitCode: 1, message: "nothing to do" }),
		).toEqual({
			status: "negative",
			exitCode: 1,
			message: "nothing to do",
		});
		expect(
			machineEnvelopeSchema.parse({
				status: "failure",
				exitCode: 2,
				errorType: "boom",
				message: "bad",
			}),
		).toEqual({
			status: "failure",
			exitCode: 2,
			errorType: "boom",
			message: "bad",
		});
		expect(
			machineEnvelopeSchema.parse({
				status: "usageError",
				exitCode: 2,
				errorType: "usageError",
				message: "missing flag",
				data: { missingFlag: "--yes" },
			}),
		).toEqual({
			status: "usageError",
			exitCode: 2,
			errorType: "usageError",
			message: "missing flag",
			data: { missingFlag: "--yes" },
		});
	});

	test("rejects noncanonical exit codes", () => {
		expect(machineEnvelopeSchema.safeParse({ exitCode: 3, message: "noncanonical" }).success).toBe(
			false,
		);
	});

	test("exports the canonical negative envelope schema", () => {
		expect(
			negativeMachineEnvelopeSchema.parse({ status: "negative", exitCode: 1, message: "nothing" }),
		).toEqual({ status: "negative", exitCode: 1, message: "nothing" });
	});
});

describe("machine envelope schema builders", () => {
	test("builds strict success envelopes around a data schema", () => {
		const schema = buildSuccessMachineEnvelopeSchema(z.object({ value: z.number() }));

		expect(schema.parse({ status: "ok", exitCode: 0, data: { value: 1 } })).toEqual({
			status: "ok",
			exitCode: 0,
			data: { value: 1 },
		});
		expect(schema.safeParse({ exitCode: 1, data: { value: 1 } }).success).toBe(false);
		expect(schema.safeParse({ status: "ok", exitCode: 0, data: { value: "1" } }).success).toBe(
			false,
		);
		expect(
			schema.safeParse({ status: "ok", exitCode: 0, data: { value: 1 }, extra: true }).success,
		).toBe(false);
	});

	test("builds strict failure envelopes with configurable validation", () => {
		const schema = buildFailureMachineEnvelopeSchema({
			errorTypeSchema: z.string().trim().min(1),
		});

		expect(
			schema.parse({ status: "failure", exitCode: 2, errorType: "boom", message: "bad" }),
		).toEqual({
			status: "failure",
			exitCode: 2,
			errorType: "boom",
			message: "bad",
		});
		expect(
			schema.parse({
				status: "negative",
				exitCode: 1,
				errorType: "negative",
				message: "nothing to do",
			}),
		).toEqual({ status: "negative", exitCode: 1, errorType: "negative", message: "nothing to do" });
		expect(schema.safeParse({ exitCode: 0, errorType: "boom", message: "bad" }).success).toBe(
			false,
		);
		expect(
			schema.safeParse({ status: "failure", exitCode: 2, errorType: " ", message: "bad" }).success,
		).toBe(false);
		expect(
			schema.safeParse({
				status: "failure",
				exitCode: 2,
				errorType: "boom",
				message: "bad",
				data: {},
			}).success,
		).toBe(true);
	});
});

describe("toMachineEnvelope", () => {
	test("bodyless ok omits data", () => {
		const envelope = toMachineEnvelope(ok());
		expect(envelope).toEqual({ status: "ok", exitCode: 0 });
		expect(envelope).not.toHaveProperty("data");
	});

	test("explicitly undefined data remains present", () => {
		for (const envelope of [
			toMachineEnvelope(ok(undefined)),
			toMachineEnvelope(negative("no", { data: undefined })),
			toMachineEnvelope(failure("failed", "failed", undefined)),
			toMachineEnvelope(usageError("invalid", undefined)),
		]) {
			expect(envelope).toHaveProperty("data");
			expect("data" in envelope).toBe(true);
			expect(envelope.data).toBeUndefined();
		}
	});

	test("ok envelope carries exitCode and data only", () => {
		const envelope = toMachineEnvelope(ok({ name: "x" }));
		expect(envelope).toEqual({ status: "ok", exitCode: 0, data: { name: "x" } });
		expect(Object.keys(envelope)).toEqual(["status", "exitCode", "data"]);
	});

	test("negative envelope without data omits the data key and uses semantic exitCode 1", () => {
		const envelope = toMachineEnvelope(negative("no plans found"));
		expect(envelope).toEqual({ status: "negative", exitCode: 1, message: "no plans found" });
		expect(Object.keys(envelope)).toEqual(["status", "exitCode", "message"]);
	});

	test("negative envelope with data orders keys exitCode, message, data", () => {
		const envelope = toMachineEnvelope(negative("empty", { data: { count: 0 } }));
		expect(Object.keys(envelope)).toEqual(["status", "exitCode", "message", "data"]);
		expect(envelope.data).toEqual({ count: 0 });
	});

	test("failure envelope orders keys exitCode, errorType, message", () => {
		const exit: ClinkrExit<never> = {
			type: "failure",
			errorType: "missing-branch",
			message: "branch not found",
		};
		const envelope = toMachineEnvelope(exit);
		expect(envelope).toEqual({
			status: "failure",
			exitCode: 2,
			errorType: "missing-branch",
			message: "branch not found",
		});
		expect(Object.keys(envelope)).toEqual(["status", "exitCode", "errorType", "message"]);
	});

	test("usage error envelope uses camelCase status and fixed error type", () => {
		const envelope = toMachineEnvelope(usageError("missing flag", { missingFlag: "--force" }));
		expect(envelope).toEqual({
			status: "usageError",
			exitCode: 2,
			errorType: "usageError",
			message: "missing flag",
			data: { missingFlag: "--force" },
		});
		expect(Object.keys(envelope)).toEqual(["status", "exitCode", "errorType", "message", "data"]);
	});
});

describe("machineEnvelopeSchema", () => {
	test("accepts the machine envelopes emitted by clinkr exits", () => {
		expect(machineEnvelopeSchema.parse(toMachineEnvelope(ok({ value: 1 })))).toEqual({
			status: "ok",
			exitCode: 0,
			data: { value: 1 },
		});
		expect(machineEnvelopeSchema.parse(toMachineEnvelope(negative("nothing to do")))).toEqual({
			status: "negative",
			exitCode: 1,
			message: "nothing to do",
		});
		expect(machineEnvelopeSchema.parse(toMachineEnvelope(failure("boom", "bad")))).toEqual({
			status: "failure",
			exitCode: 2,
			errorType: "boom",
			message: "bad",
		});
		expect(machineEnvelopeSchema.parse(toMachineEnvelope(usageError("bad args")))).toEqual({
			status: "usageError",
			exitCode: 2,
			errorType: "usageError",
			message: "bad args",
		});
	});
});

describe("envelopeJsonText", () => {
	test("serializes like Python json.dumps(value, indent=2)", () => {
		const exit: ClinkrExit<never> = { type: "failure", errorType: "boom", message: "bad" };
		const text = envelopeJsonText(toMachineEnvelope(exit));
		expect(text).toBe(
			'{\n  "status": "failure",\n  "exitCode": 2,\n  "errorType": "boom",\n  "message": "bad"\n}',
		);
	});

	test("preserves non-ASCII characters", () => {
		expect(envelopeJsonText({ name: "héllo — café" })).toBe('{\n  "name": "héllo — café"\n}');
	});

	test("nested data serializes with two-space indentation", () => {
		const envelope = toMachineEnvelope(ok({ items: ["a"], total: 1 }));
		expect(envelopeJsonText(envelope)).toBe(
			'{\n  "status": "ok",\n  "exitCode": 0,\n  "data": {\n    "items": [\n      "a"\n    ],\n    "total": 1\n  }\n}',
		);
	});
});
