import { describe, expect, test } from "vitest";

import { createRoasterRuntime } from "../../src/context.ts";
import type { RoasterResult } from "../../src/failures.ts";
import {
	extractInlineMarkers,
	inlineMarkerForFinding,
	parseFindingsCommentBody,
	parseFindingsPayloadResult,
	preserveActivityLog,
	publishFindings,
	renderFindingsComment,
	renderInlineBody,
	summaryMarkerForReview,
	type FindingsPayload,
} from "../../src/findings-publication.ts";
import { FakeRoasterGitHubGateway, type GitHubGatewayOptions } from "../../src/gateways/github.ts";
import type { PRInlineCommentInput, ReviewFinding, ReviewInputCoverage } from "../../src/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";
import { buildFindingsEnvelope } from "../support/findings-envelope.ts";
import { FailingDiscussionGateway } from "../support/github-gateways.ts";

const WARNING_FINDING: ReviewFinding = {
	path: "src/app.ts",
	line: 12,
	severity: "warning",
	summary: "Avoid broad casts",
	details: "Validate the payload before casting it.",
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
			count: 0,
			findings: [],
			inputCoverage: null,
			errorType: "harness_failed",
			errorMessage: "boom",
		});

		expect(body.startsWith("<!-- roaster:typescript-style -->\n")).toBe(true);
		expect(body).toContain("**Roaster failed**");
		expect(body).toContain("harness_failed");
	});

	test("renders no findings", () => {
		const body = renderFindingsComment(payload({ count: 0, findings: [] }));

		expect(body).toContain("**No findings** against base `main`. ✅");
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
					reason: "file_exceeds_cap",
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
				exit_code: 0,
				data: {
					reviewName: "typescript-style",
					reviewPath: "reviews/typescript-style.md",
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
		if (payloadResult.type === "ok") expect(payloadResult.payload.count).toBe(1);
	});

	test("rejects old nested and snake case success envelopes", () => {
		const nested = parseFindingsPayloadResult(
			JSON.stringify({
				exit_code: 0,
				data: {
					reviewName: "typescript-style",
					reviewPath: "reviews/typescript-style.md",
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
				exit_code: 0,
				data: {
					review_name: "typescript-style",
					review_path: "reviews/typescript-style.md",
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
			JSON.stringify({ exit_code: 2, error_type: "failure", message: "boom" }),
			{ fallbackReviewName: "review", fallbackBaseRef: "base" },
		);

		expect(result.type).toBe("ok");
		if (result.type === "ok") {
			expect(result.payload.errorType).toBe("failure");
			expect(result.payload.reviewName).toBe("review");
		}
	});

	test("requires fallback identity for failed envelopes", () => {
		const result = parseFindingsPayloadResult(
			JSON.stringify({ exit_code: 2, error_type: "failure", message: "boom" }),
		);

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error.message).toContain("--review-name");
			expect(result.error.message).toContain("--base-ref");
		}
	});

	test("parses negative envelopes as renderable payloads", () => {
		const result = parseFindingsPayloadResult(
			JSON.stringify({ exit_code: 1, error_type: "negative", message: "no findings" }),
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
			JSON.stringify({ exit_code: 3, error_type: "failure", message: "boom" }),
		);

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error.message).toBe("expected a clinkr envelope with top-level 'exit_code'");
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
			expect(result.error.fatalFailurePhase).toBe("summary_write");
			expect(result.error.reason).toBe("github_write_failed");
			expect(result.error.message).toBe("discussion write failed");
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
			expect(result.value.inlineStatus.apiError).toBe("inline validation failed");
			expect(result.value.summaryStatus).toEqual({
				type: "posted",
				marker: "<!-- roaster:typescript-style -->",
			});
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

class InlineFailureGateway extends FakeRoasterGitHubGateway {
	override async createPrReview(
		_prNumber: number,
		_comments: readonly PRInlineCommentInput[],
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<void>> {
		return {
			type: "error",
			error: { type: "github_response_invalid", message: "inline validation failed" },
		};
	}
}

function payload(overrides: Partial<FindingsPayload>): FindingsPayload {
	return {
		reviewName: "typescript-style",
		baseRef: "main",
		count: 1,
		findings: [WARNING_FINDING],
		inputCoverage: null,
		errorType: null,
		errorMessage: null,
		...overrides,
	};
}
