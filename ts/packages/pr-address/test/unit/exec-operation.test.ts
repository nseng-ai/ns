import { describe, expect, test } from "vitest";

import type { GithubPrFeedbackFailure } from "@asdl/core/github-pr-feedback";

import {
	failureDetail,
	gatewayFailureMessage,
	prFeedbackFailureMessage,
} from "../../src/exec-operation.ts";
import type { GatewayFailure } from "../../src/core/gateways.ts";

describe("exec operation failure details", () => {
	test("failureDetail prefers non-empty stderr over other fields", () => {
		expect(
			failureDetail({
				stderr: "stderr detail",
				stdout: "stdout detail",
				message: "message detail",
				code: "fallback_code",
			}),
		).toBe("stderr detail");
	});

	test("failureDetail falls through empty stderr to non-empty stdout", () => {
		expect(
			failureDetail({
				stderr: " \n\t ",
				stdout: "stdout detail",
				message: "message detail",
				code: "fallback_code",
			}),
		).toBe("stdout detail");
	});

	test("failureDetail falls through empty output fields to non-empty message", () => {
		expect(
			failureDetail({
				stderr: "",
				stdout: " \n",
				message: "message detail",
				code: "fallback_code",
			}),
		).toBe("message detail");
	});

	test("failureDetail falls through empty output and message fields to code", () => {
		expect(
			failureDetail({
				stderr: "",
				stdout: " ",
				message: "\t",
				code: "fallback_code",
			}),
		).toBe("fallback_code");
	});

	test("gatewayFailureMessage preserves returncode fallback text", () => {
		const failure = {
			code: "gh_failed",
			message: "",
			returncode: 42,
		} satisfies GatewayFailure;

		expect(gatewayFailureMessage("Fetch failed", failure)).toBe("Fetch failed: exit code 42");
	});

	test("prFeedbackFailureMessage reads nested stderr and stdout details", () => {
		const stderrFailure = {
			code: "github_pr_feedback_gh_failed",
			message: "message detail",
			details: { stderr: "stderr detail", stdout: "stdout detail" },
		} satisfies GithubPrFeedbackFailure;
		const stdoutFailure = {
			code: "github_pr_feedback_gh_failed",
			message: "message detail",
			details: { stderr: " ", stdout: "stdout detail" },
		} satisfies GithubPrFeedbackFailure;

		expect(prFeedbackFailureMessage("Fetch failed", stderrFailure)).toBe(
			"Fetch failed: stderr detail",
		);
		expect(prFeedbackFailureMessage("Fetch failed", stdoutFailure)).toBe(
			"Fetch failed: stdout detail",
		);
	});
});
