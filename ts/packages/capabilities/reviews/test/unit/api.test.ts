import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { FakeGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/testing";
import { describe, expect, test } from "vitest";

import { createReviewsClient, REVIEW_LOG_NAMESPACE } from "@nseng-ai/reviews/api";
import type {
	RecordFindingsOutcome,
	ReviewListResult,
	ReviewsRuntime,
	RunReviewOutcome,
} from "@nseng-ai/reviews/api";
import {
	createReviewsRuntime,
	type ReviewsGithubPrFeedbackGateway,
} from "../../src/core/context.ts";
import { FakeReviewRunnerGateway } from "../../src/gateways/review-runner.ts";
import {
	FakeReviewAggregationRunnerGateway,
	type ReviewAggregationRunnerGateway,
} from "../../src/gateways/review-aggregation-runner.ts";
import { FakeLocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway } from "../../src/gateways/review-log.ts";
import {
	createFindingsReview,
	createLocalDiff,
	type LocalDiff,
	type ReviewExecutionResponse,
	type ReviewFinding,
} from "../../src/core/models.ts";
import { buildFindingsEnvelope } from "../support/findings-envelope.ts";
import { fakeReviewsContext } from "../support/fake-reviews-context.ts";

const REVIEW_KEY = "typescript-style";

function sampleSource(
	options: {
		readonly description?: string;
		readonly modelProfile?: string;
		readonly appliesTo?: string;
		readonly localOnly?: boolean;
	} = {},
): string {
	return [
		"---",
		`description: ${options.description ?? "Review TypeScript diffs for style violations."}`,
		`model_profile: ${options.modelProfile ?? "fast"}`,
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
		readonly github?: ReviewsGithubPrFeedbackGateway;
		readonly stdin?: string;
		readonly reviewRunner?: FakeReviewRunnerGateway;
		readonly reviewAggregationRunner?: ReviewAggregationRunnerGateway;
	} = {},
): ReviewsRuntime {
	return createReviewsRuntime(
		fakeReviewsContext({
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
					...(options.keys === undefined ? {} : { reviewKeys: options.keys }),
					reviewsDir: "/repo/.ns/reviews",
				}),
			localDiff: new FakeLocalDiffGateway({
				defaultDiff: { ok: true, value: options.diff ?? diffForPath("src/app.ts") },
			}),
			reviewRunner:
				options.reviewRunner ??
				new FakeReviewRunnerGateway({
					defaultResult: {
						ok: true,
						value: options.response ?? {
							payload: createFindingsReview([]),
							usage: null,
							inputCoverage: null,
						},
					},
				}),
			...(options.reviewAggregationRunner === undefined
				? {}
				: { reviewAggregationRunner: options.reviewAggregationRunner }),
			...(options.reviewLog === undefined ? {} : { reviewLog: options.reviewLog }),
			...(options.github === undefined ? {} : { github: options.github }),
			...(options.stdin === undefined ? {} : { stdin: async () => options.stdin ?? "" }),
		}),
	);
}

describe("@nseng-ai/reviews/api", () => {
	test("exports a client facade and stable domain types", async () => {
		const client = createReviewsClient({ cwd: "/repo", runtime: runtimeWithFakes() });
		const result = await client.listReviews();
		const typedResult: ReviewListResult | null = result.ok ? result.value : null;

		expect(REVIEW_LOG_NAMESPACE).toBe("reviews");
		expect(typedResult?.keys).toEqual([REVIEW_KEY]);
	});

	test("listReviews delegates through the fake catalog", async () => {
		const client = createReviewsClient({
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
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.keys).toEqual([REVIEW_KEY]);
		expect(result.value.count).toBe(1);
		expect(result.value.reviews[0]?.localOnly).toBe(false);
	});

	test("listReviewLogs preserves review log namespace and entries", async () => {
		const reviewLog = new FakeReviewLogGateway({
			branch: "feature/api",
			entries: [
				{
					key: "reviews/typescript-style/2026-06-28T20-00-00-000Z.md",
					content: "# Reviews Review",
				},
			],
		});
		const client = createReviewsClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({ reviewLog }),
		});

		const result = await client.listReviewLogs({ key: REVIEW_KEY });

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.namespace).toBe("reviews");
		expect(result.value.entries).toHaveLength(1);
		expect(result.value.entries[0]?.reviewKey).toBe(REVIEW_KEY);
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
		const client = createReviewsClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({
				reviewLog,
				response: { payload: createFindingsReview([finding]), usage: null, inputCoverage: null },
			}),
		});

		const outcome: RunReviewOutcome = await client.runReview({ key: REVIEW_KEY });

		expect(outcome.type).toBe("completed");
		expect(reviewLog.writtenEntries()).toHaveLength(1);
		expect(reviewLog.writtenEntries()[0]?.namespace).toBe("reviews");
		if (outcome.type !== "completed") throw new Error("expected completed outcome");
		expect(outcome.result.findings).toEqual([finding]);
	});

	test("runReviewRoster exposes the return-only roster operation and progress callback", async () => {
		const reviewLog = new FakeReviewLogGateway();
		const events: string[] = [];
		const client = createReviewsClient({ cwd: "/repo", runtime: runtimeWithFakes({ reviewLog }) });

		const result = await client.runReviewRoster(
			{ revisionRange: "base..head", roster: [{ reviewKey: REVIEW_KEY, selected: true }] },
			{ onProgress: (event) => events.push(event.type) },
		);

		expect(result).toMatchObject({
			ok: true,
			value: {
				revisionRange: "base..head",
				entries: [{ reviewKey: REVIEW_KEY, state: "completed" }],
			},
		});
		expect(events).toEqual(["review-started", "review-completed"]);
		expect(reviewLog.writtenEntries()).toEqual([]);
	});

	test("aggregateReviewRoster exposes the return-only aggregation operation", async () => {
		const finding = {
			reviewKey: REVIEW_KEY,
			occurrence: 0,
			path: "src/app.ts",
			line: 4,
			severity: "warning" as const,
			summary: "Prefer explicit error handling.",
			details: "Return a structured failure instead of throwing for expected cases.",
		};
		const runner = new FakeReviewAggregationRunnerGateway({
			ok: true,
			value: {
				payload: {
					clusters: [
						{
							findings: [finding],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "fix",
						},
					],
				},
				usage: null,
			},
		});
		const client = createReviewsClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({ reviewAggregationRunner: runner }),
		});
		const rosterResult = {
			revisionRange: "base..head",
			ranAt: "2026-07-16T12:00:00.000Z",
			entries: [
				{
					reviewKey: REVIEW_KEY,
					position: 0,
					state: "completed" as const,
					modelProfile: "quick",
					model: "openai/gpt-5.6-luna",
					findings: [finding],
					usage: null,
					inputCoverage: null,
				},
			],
			findings: [finding],
		};

		const result = await client.aggregateReviewRoster({
			rosterResult,
			constraints: { mustGroup: [], mustSeparate: [] },
			decisions: { bulkConfirmUnconflicted: false, clusters: [] },
		});

		expect(result).toMatchObject({
			ok: true,
			value: { completeness: "all-proposed", findingDispositions: [{ finding }] },
		});
		expect(runner.calls()).toHaveLength(1);
	});

	test("recordFindings reads stdin and writes a same-session review log", async () => {
		const reviewLog = new FakeReviewLogGateway({ branch: "feature/api" });
		const client = createReviewsClient({
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
		const client = createReviewsClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({ stdin: "not json" }),
		});

		const outcome = await client.recordFindings({ reviewKey: REVIEW_KEY });

		expect(outcome).toMatchObject({
			type: "failed",
			error: { code: "review-execution-invalid-json" },
		});
	});

	test("publishFindings reads stdin and publishes through the GitHub gateway", async () => {
		const github = new FakeGithubPrFeedbackGateway({
			changedFilesByPr: new Map([
				[47, [{ path: "src/app.ts", status: "modified", patch: "@@ -4 +4 @@\n+new" }]],
			]),
		});
		const client = createReviewsClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({
				github,
				stdin: buildFindingsEnvelope([
					{
						path: "src/app.ts",
						line: 4,
						severity: "warning",
						summary: "Published through the API facade.",
						details: "The command can route through ReviewsClient.publishFindings.",
					},
				]),
			}),
		});

		const result = await client.publishFindings({ prNumber: 47 });

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.summaryStatus.type).toBe("posted");
		expect(github.createdReviews()).toHaveLength(1);
		expect(github.createdReviews()[0]?.comments[0]?.body).toContain(
			"Published through the API facade.",
		);
	});

	test("maps command-faced failures without exposing ClinkrExit", async () => {
		const client = createReviewsClient({
			cwd: "/repo",
			runtime: runtimeWithFakes({
				reviewCatalog: new FakeReviewCatalogGateway({
					listReviewKeysFailure: {
						code: "reviews-dir-missing",
						message: "No reviews directory at /repo/.ns/reviews.",
					},
				}),
			}),
		});

		const result = await client.listReviews();

		expect(result).toEqual({
			ok: false,
			error: {
				code: "reviews-dir-missing",
				message: "No reviews directory at /repo/.ns/reviews.",
			},
		});
	});
});
