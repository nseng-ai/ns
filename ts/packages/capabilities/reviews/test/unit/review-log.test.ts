import { describe, expect, test } from "vitest";

import {
	parseReviewLogEntryKey,
	renderReviewLogMarkdown,
	reviewLogEntryKey,
} from "../../src/gateways/review-log.ts";
import { createFindingsReview, type ReviewRunResult } from "../../src/core/models.ts";

function runResult(overrides: Partial<ReviewRunResult> = {}): ReviewRunResult {
	return {
		reviewName: "team/review key",
		reviewPath: "/repo/.ns/reviews/team/review key.md",
		modelProfile: "deep",
		model: "openai/gpt-5.6-terra",
		baseRef: "main",
		format: "findings",
		count: 0,
		findings: createFindingsReview([]).findings,
		usage: null,
		inputCoverage: null,
		...overrides,
	};
}

describe("review log helpers", () => {
	test("builds safe Branch Memory Entry Keys and parses their metadata", () => {
		const key = reviewLogEntryKey({
			reviewKey: "team/review key:with?chars/.. /.lock",
			ranAt: "2026-06-20T18:42:11.123Z",
		});

		expect(key).toBe("reviews/team/review-key-with-chars/review/lock/2026-06-20T18-42-11-123Z.md");
		expect(parseReviewLogEntryKey(key)).toEqual({
			reviewKey: "team/review-key-with-chars/review/lock",
			ranAt: "2026-06-20T18:42:11.123Z",
		});
	});

	test("renders Markdown with findings and no raw JSON payload", () => {
		const markdown = renderReviewLogMarkdown(
			runResult({
				count: 1,
				findings: [
					{
						path: null,
						line: null,
						severity: "info",
						summary: "Check architecture",
						details: "Readable **Markdown** details.",
					},
				],
			}),
			{
				ranAt: "2026-06-20T18:42:11.123Z",
				branch: "feature",
				headCommit: "abc123",
			},
		);

		expect(markdown).toContain("# Reviews Review: team/review key");
		expect(markdown).toContain("- Model profile: `deep`");
		expect(markdown).toContain("### 1. info — `unknown:—`");
		expect(markdown).toContain("Readable **Markdown** details.");
		expect(markdown).not.toContain("```json");
		expect(markdown).not.toContain("<!--");
	});

	test("renders quick runs as tripwire Markdown reports", () => {
		const markdown = renderReviewLogMarkdown(runResult({ modelProfile: "quick" }), {
			ranAt: "2026-06-20T18:42:11.123Z",
			branch: "feature",
			headCommit: "abc123",
		});

		expect(markdown).toContain("# Reviews Tripwire: team/review key");
		expect(markdown).toContain("- Model profile: `quick`");
	});

	test("renders a zero-finding Markdown report", () => {
		const markdown = renderReviewLogMarkdown(runResult(), {
			ranAt: "2026-06-20T18:42:11.123Z",
			branch: "feature",
			headCommit: "abc123",
		});

		expect(markdown).toContain("## Findings\n\n_No findings._");
	});
});
