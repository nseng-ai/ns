import { describe, expect, it } from "vitest";

import { isSafeSegment, requireSafeSegment } from "../../../src/payloads/segments.ts";

describe("isSafeSegment", () => {
	it("accepts valid safe segments", () => {
		expect(isSafeSegment("abc")).toBe(true);
		expect(isSafeSegment("a1")).toBe(true);
		expect(isSafeSegment("test-session")).toBe(true);
		expect(isSafeSegment("session_id")).toBe(true);
		expect(isSafeSegment("foo.bar")).toBe(true);
		expect(isSafeSegment("0abc")).toBe(true);
		expect(isSafeSegment("9test")).toBe(true);
	});

	it("rejects invalid safe segments", () => {
		expect(isSafeSegment("")).toBe(false);
		expect(isSafeSegment("ABC")).toBe(false);
		expect(isSafeSegment("-abc")).toBe(false);
		expect(isSafeSegment("_abc")).toBe(false);
		expect(isSafeSegment(".abc")).toBe(false);
		expect(isSafeSegment("a b")).toBe(false);
		expect(isSafeSegment("a/b")).toBe(false);
		expect(isSafeSegment("a" + "b".repeat(128))).toBe(false);
	});
});

describe("requireSafeSegment", () => {
	it("returns value for valid segment", () => {
		expect(requireSafeSegment("test-id", "session id")).toBe("test-id");
	});

	it("throws for invalid segment", () => {
		expect(() => requireSafeSegment("INVALID", "session id")).toThrow(/session id.*safe segment/);
	});
});
