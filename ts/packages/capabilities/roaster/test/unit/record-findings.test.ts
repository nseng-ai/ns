import { describe, expect, test } from "vitest";

import { createRoasterRuntime } from "../../src/core/context.ts";
import { FakeLocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway } from "../../src/gateways/review-log.ts";
import { createLocalDiff, type ReviewFinding } from "../../src/core/models.ts";
import { runRecordFindings } from "../../src/operations/cli-operations.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

const REVIEW_SOURCE = `---
description: Review TypeScript diffs.
model_profile: deep
---

Flag concrete maintainability issues.
`;

const FINDING: ReviewFinding = {
	path: "src/file.ts",
	line: 12,
	severity: "warning",
	summary: "Example finding",
	details: "Example details.",
};

describe("runRecordFindings", () => {
	test("records validated same-session findings as a review run log", async () => {
		const reviewLog = new FakeReviewLogGateway();
		const stderr: string[] = [];
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				localDiff: diffGateway("trunk"),
				reviewLog,
				stdin: async () => JSON.stringify({ findings: [FINDING] }),
				stderr: (text) => stderr.push(text),
			}),
		);

		const exit = await runRecordFindings(ctx, { reviewKey: "typescript-style" });

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toMatchObject({
			reviewName: "typescript-style",
			reviewPath: "/repo/.sdl/reviews/typescript-style/review.md",
			modelProfile: "deep",
			model: "same-session",
			baseRef: "trunk",
			format: "findings",
			count: 1,
			usage: null,
			inputCoverage: null,
		});
		expect(exit.data.findings).toEqual([FINDING]);
		expect(reviewLog.writtenEntries()).toHaveLength(1);
		expect(reviewLog.writtenEntries()[0]?.content).toContain("# Roaster Review: typescript-style");
		expect(reviewLog.writtenEntries()[0]?.content).toContain("- Model profile: `deep`");
		expect(stderr.join("")).toContain("recorded review log: reviews/typescript-style/");
	});

	test("rejects malformed JSON without writing a log", async () => {
		const reviewLog = new FakeReviewLogGateway();
		const ctx = createRoasterRuntime(
			fakeRoasterContext({ stdin: async () => "not json", reviewLog }),
		);

		const exit = await runRecordFindings(ctx, { reviewKey: "typescript-style" });

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("review-execution-invalid-json");
		expect(reviewLog.writtenEntries()).toEqual([]);
	});

	test("rejects schema-invalid findings without writing a log", async () => {
		const reviewLog = new FakeReviewLogGateway();
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				stdin: async () => JSON.stringify({ findings: [{ summary: "bad" }] }),
				reviewLog,
			}),
		);

		const exit = await runRecordFindings(ctx, { reviewKey: "typescript-style" });

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("review-execution-invalid-findings");
		expect(reviewLog.writtenEntries()).toEqual([]);
	});

	test("unknown review key fails before writing a log", async () => {
		const reviewLog = new FakeReviewLogGateway();
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				reviewCatalog: new FakeReviewCatalogGateway(),
				reviewLog,
				stdin: async () => JSON.stringify({ findings: [FINDING] }),
			}),
		);

		const exit = await runRecordFindings(ctx, { reviewKey: "missing-review" });

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("review-definition-not-found");
		expect(reviewLog.writtenEntries()).toEqual([]);
	});

	test("log write failure exits negative while preserving the review result", async () => {
		const reviewLog = new FakeReviewLogGateway({
			writeFailure: { type: "review-log-write-failed", message: "brmem put failed" },
		});
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				localDiff: diffGateway("main"),
				reviewLog,
				stdin: async () => JSON.stringify({ findings: [FINDING] }),
			}),
		);

		const exit = await runRecordFindings(ctx, {
			reviewKey: "typescript-style",
			model: "pi/sonnet",
		});

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") return;
		expect(exit.message).toContain("failed to write Branch Memory review log");
		expect(exit.data?.reviewName).toBe("typescript-style");
		expect(exit.data?.model).toBe("pi/sonnet");
	});
});

function diffGateway(baseRef: string): FakeLocalDiffGateway {
	return new FakeLocalDiffGateway({
		defaultDiff: {
			type: "ok",
			value: createLocalDiff({ baseRef, diffText: "", files: [] }),
		},
	});
}
