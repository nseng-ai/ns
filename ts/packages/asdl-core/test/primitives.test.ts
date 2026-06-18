import { describe, expect, test } from "vitest";

import {
	formatErrorMessage,
	formatZodError,
	formatZodIssue,
	isRecord,
	sha256Digest,
	truncatedSha256Digest,
} from "../src/primitives.ts";

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

describe("formatZodIssue", () => {
	test("formats root and dotted paths", () => {
		expect(formatZodIssue({ path: [], message: "Required" })).toBe("<root>: Required");
		expect(
			formatZodIssue({ path: ["skills", "pytest", "source"], message: "Expected string" }),
		).toBe("skills.pytest.source: Expected string");
	});

	test("supports JSONPath-style labels and fallback text", () => {
		expect(
			formatZodIssue({ path: [], message: "Required" }, { rootPath: "$", pathPrefix: "$." }),
		).toBe("$: Required");
		expect(
			formatZodIssue(
				{ path: ["version"], message: "Expected 1" },
				{ rootPath: "$", pathPrefix: "$." },
			),
		).toBe("$.version: Expected 1");
		expect(formatZodIssue(undefined, { fallback: "invalid lockfile" })).toBe("invalid lockfile");
	});

	test("can omit the root-path prefix", () => {
		expect(formatZodIssue({ path: [], message: "Required" }, { rootPath: null })).toBe("Required");
		expect(
			formatZodError({ issues: [{ path: [], message: "Required" }] }, { rootPath: null }),
		).toBe("Required");
	});
});

describe("formatZodError", () => {
	test("formats all issues with a semicolon separator", () => {
		expect(
			formatZodError({
				issues: [
					{ path: [], message: "Required" },
					{ path: ["count"], message: "Expected number" },
				],
			}),
		).toBe("<root>: Required; count: Expected number");
	});
});

describe("sha256Digest", () => {
	test("returns a full SHA256 hex digest", () => {
		expect(sha256Digest("/tmp/session.jsonl")).toBe(
			"29e67821bedc391a811d7fd8fcdf12be11edd17dc6c6340415bce3c46c72fd28",
		);
	});
});

describe("truncatedSha256Digest", () => {
	test("returns the first 32 hex characters of a SHA256 digest", () => {
		expect(truncatedSha256Digest("/tmp/session.jsonl")).toBe("29e67821bedc391a811d7fd8fcdf12be");
	});
});
