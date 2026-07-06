import type {
	GithubPrFeedbackFailure,
	GithubPrInlineCommentInput,
} from "@nseng-ai/capability-kit/github/pr-feedback";
import { FakeGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/testing";
import type { Result } from "@nseng-ai/foundation/result";
import { describe, expect, test } from "vitest";

import { createRoasterRuntime } from "../../src/core/context.ts";
import {
	buildFindingsCommentMachineState,
	extractInlineMarkers,
	inlineMarkerForFinding,
	parseFindingsCommentBody,
	parseFindingsCommentMachineState,
	parseFindingsPayloadResult,
	preserveActivityLog,
	publishFindings,
	renderFindingsComment,
	renderInlineBody,
	summaryMarkerForReview,
	type FindingsPayload,
	type LastReviewedHeadState,
} from "../../src/core/findings-publication.ts";
import type { ReviewFinding, ReviewInputCoverage } from "../../src/core/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";
import { buildFindingsEnvelope } from "../support/findings-envelope.ts";
import { githubDiscussionComment } from "../support/github-fixtures.ts";
import { FailingDiscussionGateway } from "../support/github-gateways.ts";

const WARNING_FINDING: ReviewFinding = {
	path: "src/app.ts",
	line: 12,
	severity: "warning",
	summary: "Avoid broad casts",
	details: "Validate the payload before casting it.",
};
const LAST_REVIEWED_HEAD: LastReviewedHeadState = {
	headSha: "1111111111111111111111111111111111111111",
	baseRef: "main",
	baseMergeBaseSha: "2222222222222222222222222222222222222222",
};

describe("findings comment markers", () => {
	test("summary marker is first-line parseable", () => {
		const body = `${summaryMarkerForReview("typescript-style")}\n## roaster`;

		const parsed = parseFindingsCommentBody(body);

		expect(parsed).toEqual({
			type: "ok",
			parsed: { marker: "<!-- roaster:typescript-style -->", body },
		});
		expect(parseFindingsCommentBody("intro\n<!-- roaster:typescript-style -->").type).toBe("error");
	});

	test("inline marker is stable and extractable", () => {
		const marker = inlineMarkerForFinding("typescript-style", WARNING_FINDING);

		expect(marker).toBe(inlineMarkerForFinding("typescript-style", WARNING_FINDING));
		expect(extractInlineMarkers(`text\n${marker}\nother`)).toEqual([marker]);
	});
});

describe("renderInlineBody", () => {
	test("renders marker, finding content, review name, details, and attribution", () => {
		const marker = inlineMarkerForFinding("typescript-style", WARNING_FINDING);

		const body = renderInlineBody(marker, WARNING_FINDING, { reviewName: "typescript-style" });

		expect(body).toContain(marker);
		expect(body).toContain("**warning: Avoid broad casts**");
		expect(body).toContain("_Review: `typescript-style`._");
		expect(body).toContain("Validate the payload");
		expect(body).toContain("Posted by roaster");
	});
});

describe("renderFindingsComment", () => {
	test("renders error payloads", () => {
		const body = renderFindingsComment({
			reviewName: "typescript-style",
			baseRef: "main",
			modelProfile: null,
			count: 0,
			findings: [],
			inputCoverage: null,
			errorType: "harness-failed",
			errorMessage: "boom",
		});

		expect(body.startsWith("<!-- roaster:typescript-style -->\n")).toBe(true);
		expect(body).toContain("**Roaster failed**");
		expect(body).toContain("harness-failed");
	});

	test("renders no findings", () => {
		const body = renderFindingsComment(payload({ count: 0, findings: [] }));

		expect(body).toContain("**No findings** against base `main`. ✅");
	});

	test("renders a parseable machine state after the summary marker", () => {
		const findingsPayload = payload({ count: 1, findings: [WARNING_FINDING] });
		const machineState = buildFindingsCommentMachineState({
			payload: findingsPayload,
			lastReviewedHead: LAST_REVIEWED_HEAD,
		});
		const body = renderFindingsComment(findingsPayload, { machineState });

		expect(body.startsWith("<!-- roaster:typescript-style -->\n")).toBe(true);
		expect(parseFindingsCommentBody(body).type).toBe("ok");
		expect(parseFindingsCommentMachineState(body)).toMatchObject({
			version: 1,
			lastReviewedHead: LAST_REVIEWED_HEAD,
			priorFindings: { cap: 50, prunedCount: 0 },
		});
	});

	test("keeps the most recent capped union of prior findings", () => {
		const first = finding({ summary: "first" });
		const second = finding({ summary: "second" });
		const third = finding({ summary: "third" });
		const existingState = buildFindingsCommentMachineState({
			payload: payload({ count: 2, findings: [first, second] }),
			lastReviewedHead: LAST_REVIEWED_HEAD,
			cap: 2,
		});
		const existingBody = renderFindingsComment(payload({ count: 2, findings: [first, second] }), {
			machineState: existingState,
		});

		const nextState = buildFindingsCommentMachineState({
			existingBody,
			payload: payload({ count: 2, findings: [second, third] }),
			lastReviewedHead: {
				...LAST_REVIEWED_HEAD,
				headSha: "3333333333333333333333333333333333333333",
			},
			cap: 2,
		});

		expect(nextState.priorFindings.prunedCount).toBe(1);
		expect(nextState.priorFindings.findings.map((record) => record.finding.summary)).toEqual([
			"second",
			"third",
		]);
		expect(nextState.priorFindings.findings[0]?.firstSeenHeadSha).toBe(LAST_REVIEWED_HEAD.headSha);
		expect(nextState.priorFindings.findings[0]?.lastSeenHeadSha).toBe(
			"3333333333333333333333333333333333333333",
		);
	});

	test("renders findings, null line display, inline status, and input coverage", () => {
		const coverage: ReviewInputCoverage = {
			fullDiffEstimatedTokens: 100,
			promptDiffTokenCap: 80,
			promptDiffFileTokenCap: 50,
			changedPathCount: 2,
			includedFileCount: 1,
			omittedFileCount: 1,
			omittedFiles: [
				{
					path: "large.ts",
					changeKind: "modified",
					byteSize: 1200,
					estimatedTokens: 300,
					addedLines: 4,
					removedLines: 1,
					reason: "file-exceeds-cap",
				},
			],
		};
		const noLineFinding: ReviewFinding = { ...WARNING_FINDING, line: null };

		const body = renderFindingsComment(
			payload({ count: 1, findings: [noLineFinding], inputCoverage: coverage }),
			{
				inlineStatus: {
					postedCount: 1,
					skippedDuplicateCount: 2,
					fallbackOnlyCount: 3,
					apiError: "rate limited",
				},
			},
		);

		expect(body).toContain("### Inline posting");
		expect(body).toContain("rate limited");
		expect(body).toContain("### Review input coverage");
		expect(body).toContain("| ⚠️ warning | `src/app.ts` | — | Avoid broad casts |");
		expect(body).toContain("### `src/app.ts` — warning");
	});
});

describe("payload parsers", () => {
	test("parses ok findings envelopes", () => {
		const payloadResult = parseFindingsPayloadResult(
			JSON.stringify({
				status: "ok",
				exitCode: 0,
				data: {
					reviewName: "typescript-style",
					reviewPath: ".ns/reviews/typescript-style/review.md",
					modelProfile: "quick",
					model: "haiku",
					baseRef: "main",
					format: "findings",
					count: 1,
					findings: [WARNING_FINDING],
					usage: null,
					inputCoverage: null,
				},
			}),
		);
		expect(payloadResult.type).toBe("ok");
		if (payloadResult.type === "ok") {
			expect(payloadResult.payload.modelProfile).toBe("quick");
			expect(payloadResult.payload.count).toBe(1);
		}
	});

	test("rejects old nested and snake case success envelopes", () => {
		const nested = parseFindingsPayloadResult(
			JSON.stringify({
				status: "ok",
				exitCode: 0,
				data: {
					reviewName: "typescript-style",
					reviewPath: ".ns/reviews/typescript-style/review.md",
					modelProfile: "quick",
					model: "haiku",
					baseRef: "main",
					payload: { format: "findings", count: 1, findings: [WARNING_FINDING] },
					usage: null,
					inputCoverage: null,
				},
			}),
		);
		const snakeCase = parseFindingsPayloadResult(
			JSON.stringify({
				status: "ok",
				exitCode: 0,
				data: {
					review_name: "typescript-style",
					review_path: ".ns/reviews/typescript-style/review.md",
					model: "haiku",
					base_ref: "main",
					format: "findings",
					count: 1,
					findings: [WARNING_FINDING],
					usage: null,
					input_coverage: null,
				},
			}),
		);

		expect(nested.type).toBe("error");
		expect(snakeCase.type).toBe("error");
	});

	test("parses error envelopes as renderable payloads", () => {
		const result = parseFindingsPayloadResult(
			JSON.stringify({ status: "failure", exitCode: 2, errorType: "failure", message: "boom" }),
			{ fallbackReviewName: "review", fallbackBaseRef: "base" },
		);

		expect(result.type).toBe("ok");
		if (result.type === "ok") {
			expect(result.payload.errorType).toBe("failure");
			expect(result.payload.reviewName).toBe("review");
		}
	});

	test("parses negative review result envelopes as findings payloads", () => {
		const result = parseFindingsPayloadResult(
			JSON.stringify({
				status: "negative",
				exitCode: 1,
				message: "failed to write Branch Memory review log",
				data: {
					reviewName: "typescript-style",
					reviewPath: ".ns/reviews/typescript-style/review.md",
					modelProfile: "quick",
					model: "haiku",
					baseRef: "main",
					format: "findings",
					count: 1,
					findings: [WARNING_FINDING],
					usage: null,
					inputCoverage: null,
				},
			}),
		);

		expect(result.type).toBe("ok");
		if (result.type === "ok") {
			expect(result.payload.errorType).toBeNull();
			expect(result.payload.reviewName).toBe("typescript-style");
			expect(result.payload.findings).toEqual([WARNING_FINDING]);
		}
	});

	test("requires fallback identity for failed envelopes", () => {
		const result = parseFindingsPayloadResult(
			JSON.stringify({ status: "failure", exitCode: 2, errorType: "failure", message: "boom" }),
		);

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error.message).toContain("--review-name");
			expect(result.error.message).toContain("--base-ref");
		}
	});

	test("parses negative envelopes as renderable payloads", () => {
		const result = parseFindingsPayloadResult(
			JSON.stringify({ status: "negative", exitCode: 1, message: "no findings" }),
			{ fallbackReviewName: "review", fallbackBaseRef: "base" },
		);

		expect(result.type).toBe("ok");
		if (result.type === "ok") {
			expect(result.payload.errorType).toBe("negative");
			expect(result.payload.errorMessage).toBe("no findings");
			expect(result.payload.reviewName).toBe("review");
			expect(result.payload.baseRef).toBe("base");
		}
	});

	test("rejects noncanonical failure exit codes", () => {
		const result = parseFindingsPayloadResult(
			JSON.stringify({ exitCode: 3, errorType: "failure", message: "boom" }),
		);

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error.message).toBe(
				"expected a clinkr envelope with top-level 'status' and 'exitCode'",
			);
		}
	});
});

describe("publishFindings", () => {
	test("reports summary write as a fatal summary phase", async () => {
		const runtime = createRoasterRuntime(
			fakeRoasterContext({ github: new FailingDiscussionGateway() }),
		);
		const result = await publishFindings(runtime, {
			prNumber: 47,
			envelope: buildFindingsEnvelope([]),
		});

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error.fatalFailurePhase).toBe("summary-write");
			expect(result.error.reason).toBe("github-write-failed");
			expect(result.error.message).toContain("discussion write failed");
		}
	});

	test("keeps inline failures non-fatal and reports summary status", async () => {
		const runtime = createRoasterRuntime(
			fakeRoasterContext({
				github: new InlineFailureGateway({
					changedFilesByPr: new Map([
						[47, [{ path: "src/app.ts", status: "modified", patch: "@@ -12 +12 @@\n+new" }]],
					]),
				}),
			}),
		);
		const result = await publishFindings(runtime, {
			prNumber: 47,
			envelope: buildFindingsEnvelope([WARNING_FINDING]),
		});

		expect(result.type).toBe("ok");
		if (result.type === "ok") {
			expect(result.value.inlineStatus.apiError).toBe(
				"GitHub response for create PR review: did not match the expected shape: inline validation failed in /repo",
			);
			expect(result.value.summaryStatus).toEqual({
				type: "posted",
				marker: "<!-- roaster:typescript-style -->",
			});
		}
	});

	test("posts Last-reviewed head state and current findings in the machine block", async () => {
		const github = new FakeGithubPrFeedbackGateway();
		const runtime = createRoasterRuntime(fakeRoasterContext({ github }));

		const result = await publishFindings(runtime, {
			prNumber: 47,
			envelope: buildFindingsEnvelope([WARNING_FINDING]),
			lastReviewedHead: LAST_REVIEWED_HEAD,
		});

		expect(result.type).toBe("ok");
		const written = await github.findPrDiscussionCommentByMarker({
			cwd: "/repo",
			prNumber: 47,
			marker: "<!-- roaster:typescript-style -->",
			authorLogin: "github-actions[bot]",
		});
		expect(written.ok).toBe(true);
		if (written.ok) {
			const state = parseFindingsCommentMachineState(written.value?.body ?? "");
			expect(state?.lastReviewedHead).toEqual(LAST_REVIEWED_HEAD);
			expect(state?.priorFindings.findings.map((record) => record.finding)).toEqual([
				WARNING_FINDING,
			]);
		}
	});

	test("carries prior findings forward when the rendered summary body is overwritten", async () => {
		const existingState = buildFindingsCommentMachineState({
			payload: payload({ count: 1, findings: [WARNING_FINDING] }),
			lastReviewedHead: LAST_REVIEWED_HEAD,
		});
		const existingBody = renderFindingsComment(payload({ count: 1, findings: [WARNING_FINDING] }), {
			machineState: existingState,
		});
		const github = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([
				[
					47,
					[githubDiscussionComment({ id: 10, body: existingBody, author: "github-actions[bot]" })],
				],
			]),
		});
		const runtime = createRoasterRuntime(fakeRoasterContext({ github }));

		const result = await publishFindings(runtime, {
			prNumber: 47,
			envelope: buildFindingsEnvelope([]),
			lastReviewedHead: {
				...LAST_REVIEWED_HEAD,
				headSha: "3333333333333333333333333333333333333333",
			},
		});

		expect(result.type).toBe("ok");
		const written = await github.findPrDiscussionCommentByMarker({
			cwd: "/repo",
			prNumber: 47,
			marker: "<!-- roaster:typescript-style -->",
			authorLogin: "github-actions[bot]",
		});
		expect(written.ok).toBe(true);
		if (written.ok) {
			expect(written.value?.body).toContain("**No findings** against base `main`. ✅");
			const state = parseFindingsCommentMachineState(written.value?.body ?? "");
			expect(state?.priorFindings.findings.map((record) => record.finding.summary)).toEqual([
				"Avoid broad casts",
			]);
		}
	});
});

describe("preserveActivityLog", () => {
	test("extracts, strips, appends, caps at ten, and terminates with newline", () => {
		const existing = `${summaryMarkerForReview("review")}\nbody\n\n### Activity Log\n\n${Array.from({ length: 10 }, (_value, index) => `- old ${index}`).join("\n")}\n`;
		const merged = preserveActivityLog(
			existing,
			`${summaryMarkerForReview("review")}\nnew body\n\n### Activity Log\n\n- stale`,
			"new run",
		);

		expect(merged).not.toContain("stale");
		expect(merged).not.toContain("old 0");
		expect(merged).toContain("old 9");
		expect(merged).toContain("- new run");
		expect(merged.endsWith("\n")).toBe(true);
	});
});

class InlineFailureGateway extends FakeGithubPrFeedbackGateway {
	override async createPrReview(_params: {
		readonly prNumber: number;
		readonly comments: readonly GithubPrInlineCommentInput[];
	}): Promise<Result<void, GithubPrFeedbackFailure>> {
		return {
			ok: false,
			error: {
				code: "github_pr_feedback_response_invalid",
				message: "inline validation failed",
				details: { operation: "createPrReview" },
			},
		};
	}
}

function payload(overrides: Partial<FindingsPayload>): FindingsPayload {
	return {
		reviewName: "typescript-style",
		baseRef: "main",
		modelProfile: "quick",
		count: 1,
		findings: [WARNING_FINDING],
		inputCoverage: null,
		errorType: null,
		errorMessage: null,
		...overrides,
	};
}

function finding(overrides: Partial<ReviewFinding>): ReviewFinding {
	return { ...WARNING_FINDING, ...overrides };
}
