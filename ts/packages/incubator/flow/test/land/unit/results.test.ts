import { describe, expect, test } from "vitest";

import { landingExecutionFailure, landingFailureFacts } from "@nseng-ai/flow/land/api";
import type { LandingFailure } from "@nseng-ai/flow/land/api";

const execResult = {
	type: "exited",
	stdout: "",
	stderr: "failed\n",
	code: 1,
	signal: null,
} as const;

describe("landing failure facts", () => {
	test("preserves execution failure facts", () => {
		const failure = landingExecutionFailure("Execution failed.", {
			level: "warning",
			displayCommand: "gt delete feature-a",
			execResult,
			failedBranch: "feature-a",
			failedPrNumber: 42,
			suggestedAction: "Inspect the stack.",
			outcome: "refusal",
			refusalReason: "declined",
		});

		expect(landingFailureFacts(failure)).toEqual({
			level: "warning",
			outcome: "refusal",
			message: "Execution failed.",
			displayCommand: "gt delete feature-a",
			execResult,
			failedBranch: "feature-a",
			failedPrNumber: 42,
			suggestedAction: "Inspect the stack.",
			refusalReason: "declined",
		});
	});

	test.each([
		{
			name: "boundary",
			failure: {
				type: "boundary",
				phase: "preflight",
				source: "git",
				code: "git-failed",
				message: "Boundary failed.",
				displayCommand: "git status",
				execResult,
				suggestedAction: "Inspect Git.",
			} satisfies LandingFailure,
			expected: {
				level: "error",
				outcome: "failure",
				message: "Boundary failed.",
				displayCommand: "git status",
				execResult,
				suggestedAction: "Inspect Git.",
			},
		},
		{
			name: "domain",
			failure: {
				type: "domain",
				phase: "preflight",
				reason: "pull-request-not-open",
				message: "Pull request is not open.",
				failedBranch: "feature-b",
				failedPrNumber: 43,
				suggestedAction: "Open the pull request.",
			} satisfies LandingFailure,
			expected: {
				level: "error",
				outcome: "failure",
				message: "Pull request is not open.",
				failedBranch: "feature-b",
				failedPrNumber: 43,
				suggestedAction: "Open the pull request.",
			},
		},
		{
			name: "not-implemented",
			failure: {
				type: "not-implemented",
				phase: "request-validation",
				message: "Not implemented.",
			} satisfies LandingFailure,
			expected: {
				level: "error",
				outcome: "failure",
				message: "Not implemented.",
			},
		},
	] as const)("maps $name failure facts", ({ failure, expected }) => {
		expect(landingFailureFacts(failure)).toEqual(expected);
	});
});
