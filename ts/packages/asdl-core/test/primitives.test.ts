import { describe, expect, test } from "vitest";

import { formatErrorMessage, isRecord } from "../src/primitives.ts";

describe("isRecord", () => {
	test("accepts plain objects", () => {
		expect(isRecord({ key: "value" })).toBe(true);
	});

	test("rejects null", () => {
		expect(isRecord(null)).toBe(false);
	});

	test("rejects arrays", () => {
		expect(isRecord(["value"])).toBe(false);
	});

	test.each(["value", 123, true])("rejects primitive %p", (value) => {
		expect(isRecord(value)).toBe(false);
	});
});

describe("formatErrorMessage", () => {
	test("returns an Error message", () => {
		expect(formatErrorMessage(new Error("boom"))).toBe("boom");
	});

	test("stringifies non-Error values", () => {
		expect(formatErrorMessage("boom")).toBe("boom");
		expect(formatErrorMessage(123)).toBe("123");
	});
});
