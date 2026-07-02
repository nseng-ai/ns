import { describe, expect, test } from "vitest";

import { diagnosticErrorMessage, errorMessage } from "../src/kit/shared/errors.ts";

describe("shared error helpers", () => {
	test("errorMessage keeps conservative user-facing semantics", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
		expect(errorMessage("string failure")).toBe("string failure");
		expect(errorMessage(12)).toBe("unknown error");
		expect(errorMessage({ message: "object failure" })).toBe("unknown error");
		expect(errorMessage(null)).toBe("unknown error");
		expect(errorMessage(undefined)).toBe("unknown error");
	});

	test("diagnosticErrorMessage stringifies non-Error values", () => {
		expect(diagnosticErrorMessage(new Error("boom"))).toBe("boom");
		expect(diagnosticErrorMessage("string failure")).toBe("string failure");
		expect(diagnosticErrorMessage(12)).toBe("12");
		expect(diagnosticErrorMessage({ message: "object failure" })).toBe("[object Object]");
		expect(diagnosticErrorMessage(null)).toBe("null");
		expect(diagnosticErrorMessage(undefined)).toBe("undefined");
	});
});
