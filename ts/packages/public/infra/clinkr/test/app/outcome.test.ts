import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
	buildEnvelopeSchema,
	exitCodeFor,
	failure,
	negative,
	ok,
	toEnvelope,
	usageError,
} from "@nseng-ai/clinkr/app";
import { envelopeJsonText } from "../../src/app/outcome.ts";

describe("outcome constructors", () => {
	test("ok() carries an explicit undefined payload", () => {
		expect(ok()).toEqual({ status: "success", data: undefined });
	});

	test("ok(data) carries only the typed payload", () => {
		expect(ok({ name: "Ada" })).toEqual({ status: "success", data: { name: "Ada" } });
	});

	test("negative carries message plus optional freeform data", () => {
		expect(negative("no")).toEqual({ status: "negative", message: "no" });
		expect(negative("no", { data: { reason: "empty" } })).toEqual({
			status: "negative",
			message: "no",
			data: { reason: "empty" },
		});
	});

	test("failure carries errorType, message, and optional freeform data", () => {
		expect(failure("io-error", "disk gone")).toEqual({
			status: "failure",
			errorType: "io-error",
			message: "disk gone",
		});
		expect(failure("io-error", "disk gone", { path: "/x" })).toEqual({
			status: "failure",
			errorType: "io-error",
			message: "disk gone",
			data: { path: "/x" },
		});
	});

	test("usageError defaults errorType to usage-error", () => {
		expect(usageError("bad flags")).toEqual({
			status: "usage-error",
			errorType: "usage-error",
			message: "bad flags",
		});
		expect(usageError("bad flags", { flags: ["-a"] })).toEqual({
			status: "usage-error",
			errorType: "usage-error",
			message: "bad flags",
			data: { flags: ["-a"] },
		});
	});
});

describe("exitCodeFor", () => {
	test.each([
		["success", 0],
		["negative", 1],
		["failure", 2],
		["usage-error", 2],
	] as const)("%s maps to %d", (status, exitCode) => {
		expect(exitCodeFor(status)).toBe(exitCode);
	});
});

describe("toEnvelope", () => {
	test("keeps stable field order", () => {
		const envelope = toEnvelope(ok({ name: "Ada" }));
		expect(envelope).toEqual({ status: "success", exitCode: 0, data: { name: "Ada" } });
		expect(Object.keys(envelope)).toEqual(["status", "exitCode", "data"]);
	});

	test("omits the data key entirely when data is undefined", () => {
		for (const envelope of [
			toEnvelope(ok()),
			toEnvelope(negative("no")),
			toEnvelope(failure("io-error", "disk gone")),
			toEnvelope(usageError("bad flags")),
		]) {
			expect(envelope).not.toHaveProperty("data");
		}
	});

	test("negative envelope carries message before data", () => {
		expect(Object.keys(toEnvelope(negative("no", { data: 1 })))).toEqual([
			"status",
			"exitCode",
			"message",
			"data",
		]);
		expect(toEnvelope(negative("no"))).toEqual({ status: "negative", exitCode: 1, message: "no" });
	});

	test("failure and usage-error envelopes carry errorType and message", () => {
		expect(toEnvelope(failure("io-error", "disk gone", { path: "/x" }))).toEqual({
			status: "failure",
			exitCode: 2,
			errorType: "io-error",
			message: "disk gone",
			data: { path: "/x" },
		});
		expect(toEnvelope(usageError("bad flags"))).toEqual({
			status: "usage-error",
			exitCode: 2,
			errorType: "usage-error",
			message: "bad flags",
		});
	});
});

describe("envelopeJsonText", () => {
	test("renders an object as 2-space-indented JSON", () => {
		expect(envelopeJsonText(toEnvelope(ok({ name: "Ada" })))).toBe(
			'{\n  "status": "success",\n  "exitCode": 0,\n  "data": {\n    "name": "Ada"\n  }\n}',
		);
	});

	test("rejects top-level values that JSON.stringify cannot serialize", () => {
		expect(() => envelopeJsonText(undefined)).toThrow("value is not JSON-serializable");
	});
});

describe("buildEnvelopeSchema", () => {
	const schema = buildEnvelopeSchema(z.object({ name: z.string() }));

	test("accepts a typed success envelope", () => {
		expect(
			schema.safeParse({ status: "success", exitCode: 0, data: { name: "Ada" } }).success,
		).toBe(true);
	});

	test("rejects success data that does not match resultSchema", () => {
		expect(schema.safeParse({ status: "success", exitCode: 0, data: { name: 1 } }).success).toBe(
			false,
		);
	});

	test("bodyless success rejects a data key", () => {
		const bodyless = buildEnvelopeSchema(undefined);
		expect(bodyless.safeParse({ status: "success", exitCode: 0 }).success).toBe(true);
		expect(bodyless.safeParse({ status: "success", exitCode: 0, data: {} }).success).toBe(false);
	});

	test("error arms have fixed shapes with freeform optional data", () => {
		expect(schema.safeParse({ status: "negative", exitCode: 1, message: "no" }).success).toBe(true);
		expect(
			schema.safeParse({
				status: "failure",
				exitCode: 2,
				errorType: "io-error",
				message: "x",
				data: ["anything"],
			}).success,
		).toBe(true);
		expect(
			schema.safeParse({
				status: "usage-error",
				exitCode: 2,
				errorType: "invalid-request",
				message: "x",
				data: { issues: [] },
			}).success,
		).toBe(true);
	});

	test("rejects wrong exit codes and unknown keys per arm", () => {
		expect(schema.safeParse({ status: "negative", exitCode: 2, message: "no" }).success).toBe(
			false,
		);
		expect(schema.safeParse({ status: "failure", exitCode: 2, message: "x" }).success).toBe(false);
		expect(
			schema.safeParse({
				status: "usage-error",
				exitCode: 2,
				errorType: "usage-error",
				message: "x",
				extra: true,
			}).success,
		).toBe(false);
	});
});
