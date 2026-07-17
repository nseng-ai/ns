import { describe, expect, it } from "vitest";

import {
	DISPATCH_DIAGNOSTIC_MESSAGE_MAX_CHARS,
	DispatchDiagnosticError,
	normalizeDispatchFailure,
	renderDispatchFailureDiagnostic,
	sanitizeDispatchDiagnosticMessage,
} from "../../src/dispatch/failure-diagnostic.ts";

describe("dispatch failure diagnostics", () => {
	it("normalizes only bounded allowlisted fields", () => {
		expect(
			normalizeDispatchFailure({
				operation: "create_sandbox",
				reason: "vercel-sandbox-api-error",
				errorName: "APIError",
				errorCode: "forbidden",
				httpStatus: 403,
				requestId: "iad1::abc-123",
				message: "Status code 403 is not ok.",
			}),
		).toEqual({
			operation: "create_sandbox",
			reason: "vercel-sandbox-api-error",
			errorName: "APIError",
			errorCode: "forbidden",
			httpStatus: 403,
			requestId: "iad1::abc-123",
			message: "Status code 403 is not ok.",
		});
	});

	it("redacts credential forms, collapses controls, and visibly truncates", () => {
		const message = sanitizeDispatchDiagnosticMessage(
			"Authorization: Bearer abc.secret\nhttps://user:pass@example.test x=" +
				"eyJabc.def.ghi token=token-fixture private_key=key-fixture " +
				"x".repeat(DISPATCH_DIAGNOSTIC_MESSAGE_MAX_CHARS),
		);

		expect(message).toContain("Authorization: [redacted]");
		expect(message).toContain("https://[redacted]@example.test");
		expect(message).toContain("[redacted-jwt]");
		expect(message).toContain("token=[redacted]");
		expect(message).toContain("private_key=[redacted]");
		expect(message.endsWith("…")).toBe(true);
		expect(message.length).toBe(DISPATCH_DIAGNOSTIC_MESSAGE_MAX_CHARS);
		for (const secret of [
			"abc.secret",
			"user:pass",
			"eyJabc.def.ghi",
			"token-fixture",
			"key-fixture",
		]) {
			expect(message).not.toContain(secret);
		}
	});

	it("is total for hostile getters and malformed optional fields", () => {
		const hostile = Object.defineProperty({}, "message", {
			get() {
				throw new Error("getter secret");
			},
		});
		expect(() =>
			normalizeDispatchFailure({
				operation: "poll_dispatch_result",
				reason: "unexpected-exception",
				error: hostile,
				httpStatus: 999,
				requestId: "spaces are forbidden",
			}),
		).not.toThrow();
		expect(
			normalizeDispatchFailure({
				operation: "poll_dispatch_result",
				reason: "unexpected-exception",
				error: hostile,
				httpStatus: 999,
				requestId: "spaces are forbidden",
			}),
		).toEqual({ operation: "poll_dispatch_result", reason: "unexpected-exception" });
	});

	it("re-normalizes carried diagnostics and overrides their operation", () => {
		const diagnostic = normalizeDispatchFailure({
			operation: "prepare_and_launch_harness",
			reason: "outer-reason-is-ignored",
			error: new DispatchDiagnosticError({
				operation: "untrusted operation",
				reason: "invalid reason",
				errorName: "invalid error name",
				errorCode: "invalid error code",
				httpStatus: 999,
				requestId: "invalid request id",
				message:
					"Authorization: Bearer secret-token " + "x".repeat(DISPATCH_DIAGNOSTIC_MESSAGE_MAX_CHARS),
			}),
		});

		expect(diagnostic).toEqual({
			operation: "prepare_and_launch_harness",
			reason: "unexpected-exception",
			message: expect.stringMatching(/Authorization: \[redacted\].*…$/),
		});
		expect(diagnostic.message).toHaveLength(DISPATCH_DIAGNOSTIC_MESSAGE_MAX_CHARS);
		expect(diagnostic.message).not.toContain("secret-token");
	});

	it("renders one shared actionable sentence", () => {
		const diagnostic = normalizeDispatchFailure({
			operation: "create_sandbox",
			reason: "vercel-sandbox-api-error",
			httpStatus: 403,
			message: "Status code 403 is not ok.",
		});
		expect(
			renderDispatchFailureDiagnostic({
				code: "launch-failed",
				summary: "Sandbox creation failed.",
				diagnostic,
				anchorPrNumber: 3612,
			}),
		).toBe(
			"Sandbox creation failed. Status code 403 is not ok. Code: launch-failed. Operation: create_sandbox. HTTP status: 403. Anchor PR: #3612.",
		);
	});
});
