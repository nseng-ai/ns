import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { describe, expect, test } from "vitest";

import { createRoasterClient, ROASTER_REVIEW_LOG_NAMESPACE } from "@sdl/roaster/api";
import type {
	RecordFindingsOutcome,
	ReviewListResult,
	RoasterRuntime,
	RunRoasterReviewOutcome,
} from "@sdl/roaster/api";
import { createRoasterRuntime } from "../../src/context.ts";
import { FakeReviewRunnerGateway } from "../../src/gateways/review-runner.ts";
import { FakeLocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway } from "../../src/gateways/review-log.ts";
import {
	createFindingsReview,
	createLocalDiff,
	type LocalDiff,
	type ReviewExecutionResponse,
	type ReviewFinding,
} from "../../src/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

const REVIEW_KEY = "typescript-style";

function sampleSource(
	options: {
		readonly description?: string;
		readonly modelProfile?: string;
		readonly appliesTo?: string;
		readonly localOnly?: boolean | undefined;
	} = {},
): string {
	return [
		"---",
		`description: ${options.description ?? "Review TypeScript diffs for style violations."}`,
		`model_profile: ${options.modelProfile ?? "quick"}`,
		...(options.localOnly === true ? ["local_only: true"] : []),
		...(options.appliesTo === undefined ? [] : [options.appliesTo.trimEnd()]),
		"---",
		"",
		"Flag concrete issues in the diff.",
	].join("\n");
}

function diffForPath(path: string): LocalDiff {
	const rawText = `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n+changed\n`;
	return createLocalDiff({
		baseRef: "main",
		diffText: rawText,
		files: [
			{
				path,
				oldPath: null,
				changeKind: "modified",
				rawText,
				isBinary: false,
				addedLines: 1,
				removedLines: 0,
				hunkCount: 1,
				byteSize: rawText.length,
				estimatedTokens: 10,
			},
		],
	});
}

function runtimeWithFakes(
	options: {
		readonly sources?: Record<string, string>;
		readonly keys?: readonly string[];
		readonly diff?: LocalDiff;
		readonly response?: ReviewExecutionResponse;
		readonly reviewLog?: FakeReviewLogGateway;
		readonly reviewCatalog?: FakeReviewCatalogGateway;
		readonly stdin?: string | undefined;
		readonly reviewRunner?: FakeReviewRunnerGateway;
	} = {},
): RoasterRuntime {
	return createRoasterRuntime(
		fakeRoasterContext({
			gitGateway: new InMemoryGitGateway({
				repoRoot: "/repo",
				optionalRepoRoot: "/repo",
				currentBranch: "feature/api",
				trunkBranch: "main",
				originUrl: "git@example.com:repo.git\n",
				headCommit: "abc123",
				existingBranches: ["feature/api", "main"],
			}),
			reviewCatalog:
				options.reviewCatalog ??
				new FakeReviewCatalogGateway({
					reviewSourcesByKey: options.sources ?? { [REVIEW_KEY]: sampleSource() },
					reviewKeys: options.keys,
					reviewsDir: "/repo/.sdl/reviews",
				}),
			localDiff: new FakeLocalDiffGateway({
				defaultDiff: { type: "ok", value: options.diff ?? diffForPath("src/app.ts") },
			}),
			reviewRunner:
				options.reviewRunner ??
				new FakeReviewRunnerGateway({
					defaultResult: {
						type: "ok",
						value: options.response ?? {
							payload: createFindingsReview([]),
							usage: null,
							inputCoverage: null,
						},
					},
				}),
			...(options.reviewLog === undefined ? {} : { reviewLog: options.reviewLog }),
			...(options.stdin === undefined ? {} : { stdin: async () => options.stdin ?? "" }),
		}),
	);
}

describe("@sdl/roaster/api", () => {
	test("exports a client facade and stable domain types", async () => {
		const client = createRoasterClient({ cwd: "/repo", runtime: runtimeWithFakes() });
		const result = await client.listReviews();
		const typedResult: ReviewListResult | null = result.ok ? result.result : null;

		expect(ROASTER_REVIEW_LOG_NAMESPACE).toBe("roaster");
		expect(typedResult?.keys).toEqual([REVIEW_KEY]);
	});

	test("listReviews delegates through the fake catalog", async () => {
		const client = createRoasterClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({
				sources: {
					"local-typescript": sampleSource({ localOnly: true }),
					[REVIEW_KEY]: sampleSource(),
				},
				keys: ["local-typescript", REVIEW_KEY],
			}),
		});

		const result = await client.listReviews({ ci: true });

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error(result.failure.message);
		expect(result.result.keys).toEqual([REVIEW_KEY]);
		expect(result.result.count).toBe(1);
		expect(result.result.reviews[0]?.localOnly).toBe(false);
	});

	test("listReviewLogs preserves review log namespace and entries", async () => {
		const reviewLog = new FakeReviewLogGateway({
			branch: "feature/api",
			entries: [
				{
					key: "reviews/typescript-style/2026-06-28T20-00-00-000Z.md",
					content: "# Roaster Review",
				},
			],
		});
		const client = createRoasterClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({ reviewLog }),
		});

		const result = await client.listReviewLogs({ key: REVIEW_KEY });

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error(result.failure.message);
		expect(result.result.namespace).toBe("roaster");
		expect(result.result.entries).toHaveLength(1);
		expect(result.result.entries[0]?.reviewKey).toBe(REVIEW_KEY);
	});

	test("runReview returns a domain outcome and writes through the fake review log", async () => {
		const finding: ReviewFinding = {
			path: "src/app.ts",
			line: 4,
			severity: "warning",
			summary: "Prefer explicit error handling.",
			details: "Return a structured failure instead of throwing for expected cases.",
		};
		const reviewLog = new FakeReviewLogGateway({ branch: "feature/api" });
		const client = createRoasterClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({
				reviewLog,
				response: { payload: createFindingsReview([finding]), usage: null, inputCoverage: null },
			}),
		});

		const outcome: RunRoasterReviewOutcome = await client.runReview({ key: REVIEW_KEY });

		expect(outcome.type).toBe("completed");
		expect(reviewLog.writtenEntries()).toHaveLength(1);
		expect(reviewLog.writtenEntries()[0]?.namespace).toBe("roaster");
		if (outcome.type !== "completed") throw new Error("expected completed outcome");
		expect(outcome.result.findings).toEqual([finding]);
	});

	test("recordFindings reads stdin and writes a same-session review log", async () => {
		const reviewLog = new FakeReviewLogGateway({ branch: "feature/api" });
		const client = createRoasterClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({
				reviewLog,
				stdin: JSON.stringify({
					findings: [
						{
							path: "src/app.ts",
							line: 9,
							severity: "error",
							summary: "Finding from same-session review.",
							details: "The finding payload is preserved in the review log.",
						},
					],
				}),
			}),
		});

		const outcome: RecordFindingsOutcome = await client.recordFindings({ reviewKey: REVIEW_KEY });

		expect(outcome.type).toBe("recorded");
		expect(reviewLog.writtenEntries()).toHaveLength(1);
		expect(reviewLog.writtenEntries()[0]?.key).toMatch(/^reviews\/typescript-style\/.+\.md$/u);
		if (outcome.type !== "recorded") throw new Error("expected recorded outcome");
		expect(outcome.result.model).toBe("same-session");
		expect(outcome.result.findings[0]?.summary).toBe("Finding from same-session review.");
	});

	test("recordFindings returns domain failures for malformed stdin", async () => {
		const client = createRoasterClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({ stdin: "not json" }),
		});

		const outcome = await client.recordFindings({ reviewKey: REVIEW_KEY });

		expect(outcome).toMatchObject({
			type: "failed",
			error: { type: "review_execution_invalid_json" },
		});
	});

	test("maps command-faced failures without exposing ClinkrExit", async () => {
		const client = createRoasterClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({
				reviewCatalog: new FakeReviewCatalogGateway({
					listReviewKeysFailure: {
						type: "reviews-dir-missing",
						message: "No reviews directory at /repo/.sdl/reviews.",
					},
				}),
			}),
		});

		const result = await client.listReviews();

		expect(result).toEqual({
			ok: false,
			failure: {
				errorType: "reviews-dir-missing",
				message: "No reviews directory at /repo/.sdl/reviews.",
			},
		});
	});
});
