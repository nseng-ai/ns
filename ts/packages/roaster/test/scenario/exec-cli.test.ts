import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { RoasterContext } from "../../src/context.ts";
import type { RoasterResult } from "../../src/failures.ts";
import {
	FakeRoasterGitHubGateway,
	type GitHubGatewayOptions,
	type RoasterGitHubGateway,
} from "../../src/gateways/github.ts";
import type {
	PRChangedFile,
	PRDiscussionComment,
	PRInlineCommentInput,
	PRReviewComment,
	ReviewFinding,
} from "../../src/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";
import {
	buildFindingsEnvelope,
	type FindingsEnvelopeOptions,
} from "../support/findings-envelope.ts";

interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

async function runRoaster(
	args: readonly string[],
	options: { readonly stdin?: string; readonly github?: RoasterGitHubGateway } = {},
): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const context: RoasterContext = fakeRoasterContext({
		github: options.github,
		stdin: async () => options.stdin ?? "",
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	const exitCode = await runCli(args, { context });
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

const EXEC_CLI_FINDINGS_ENVELOPE_OPTIONS = {
	reviewName: "dignified-python",
	reviewPath: "/repo/reviews/dignified-python.md",
	model: "sonnet",
	baseRef: "master",
} as const satisfies FindingsEnvelopeOptions;

function failedEnvelope(): string {
	return JSON.stringify({
		exit_code: 2,
		error_type: "harness_binary_missing",
		message: "claude not found",
	});
}

const inlineFinding = {
	path: "app.py",
	line: 1,
	severity: "warning",
	summary: "Inline this",
	details: "This line is in the PR diff.",
} as const satisfies ReviewFinding;

const fallbackFinding = {
	path: "other.py",
	line: 10,
	severity: "info",
	summary: "Fallback",
	details: "Not changed.",
} as const satisfies ReviewFinding;

class ThrowingCreateReviewGateway extends FakeRoasterGitHubGateway {
	override async createPrReview(
		_prNumber: number,
		_comments: readonly PRInlineCommentInput[],
		_options: GitHubGatewayOptions,
	): Promise<never> {
		throw new Error("validation failed");
	}
}

class FailingDiscussionGateway extends FakeRoasterGitHubGateway {
	override async addPrDiscussionComment(
		_prNumber: number,
		_body: string,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		return {
			type: "error",
			error: {
				type: "github_cli_failed",
				message: "discussion write failed",
			},
		};
	}
}

class UnexpectedInlineQueryGateway extends FakeRoasterGitHubGateway {
	override async getPrChangedFiles(
		_prNumber: number,
		_options: GitHubGatewayOptions,
	): Promise<never> {
		throw new Error("changed files should not be queried");
	}

	override async getPrReviewComments(
		_prNumber: number,
		_options: GitHubGatewayOptions,
	): Promise<never> {
		throw new Error("review comments should not be queried");
	}
}

const changedFiles = new Map<number, readonly PRChangedFile[]>([
	[47, [{ path: "app.py", status: "modified", patch: "@@ -1 +1 @@\n+new" }]],
]);

async function findSummaryComment(
	gateway: RoasterGitHubGateway,
	marker: string,
): Promise<PRDiscussionComment | null> {
	const result = await gateway.findPrDiscussionCommentByMarker({
		prNumber: 47,
		marker,
		authorLogin: "github-actions[bot]",
		cwd: "/repo",
		env: {},
	});
	expect(result.type).toBe("ok");
	return result.type === "ok" ? result.value : null;
}

describe("roaster exec CLI", () => {
	test("exec help lists the collapsed publication command", async () => {
		const run = await runRoaster(["exec", "--help"]);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("publish-findings");
		expect(run.stdout).not.toContain("post-inline-findings");
		expect(run.stdout).not.toContain("format-findings-comment");
		expect(run.stdout).not.toContain("post-findings-comment");
	});

	test("publish-findings rejects malformed stdin", async () => {
		const run = await runRoaster(["exec", "publish-findings", "--pr-number", "47"], {
			stdin: "not json",
		});
		expect(run.exitCode).toBe(1);
		expect(run.stderr).toContain("valid JSON");
	});

	test("failed review envelopes require explicit fallback identity", async () => {
		const run = await runRoaster(["exec", "publish-findings", "--pr-number", "47"], {
			stdin: failedEnvelope(),
			github: new UnexpectedInlineQueryGateway(),
		});

		expect(run.exitCode).toBe(1);
		expect(run.stderr).toContain("--review-name");
		expect(run.stderr).toContain("--base-ref");
	});

	test("empty and failed review envelopes publish summaries without inline queries", async () => {
		const emptyGateway = new UnexpectedInlineQueryGateway();
		const empty = await runRoaster(["exec", "publish-findings", "--pr-number", "47"], {
			stdin: buildFindingsEnvelope([], EXEC_CLI_FINDINGS_ENVELOPE_OPTIONS),
			github: emptyGateway,
		});
		expect(empty.exitCode).toBe(0);
		expect(empty.stdout).toBe("");
		expect(empty.stderr).toContain("inline findings: posted=0");
		expect(empty.stderr).toContain("posted findings comment");
		const emptyComment = await findSummaryComment(
			emptyGateway,
			"<!-- roaster:dignified-python -->",
		);
		expect(emptyComment?.body).toContain("**No findings** against base `master`. ✅");

		const failedGateway = new UnexpectedInlineQueryGateway();
		const failed = await runRoaster(
			[
				"exec",
				"publish-findings",
				"--pr-number",
				"47",
				"--review-name",
				"fallback-review",
				"--base-ref",
				"main",
			],
			{ stdin: failedEnvelope(), github: failedGateway },
		);
		expect(failed.exitCode).toBe(0);
		expect(failed.stderr).toContain("inline findings: posted=0");
		const failedComment = await findSummaryComment(
			failedGateway,
			"<!-- roaster:fallback-review -->",
		);
		expect(failedComment?.body).toContain("**Roaster failed** against base `main`");
		expect(failedComment?.body).toContain("claude not found");
	});

	test("publish-findings posts inlineable findings and a summary comment in one command", async () => {
		const gateway = new FakeRoasterGitHubGateway({ changedFilesByPr: changedFiles });
		const run = await runRoaster(
			["exec", "publish-findings", "--pr-number", "47", "--run-url", "https://run"],
			{
				stdin: buildFindingsEnvelope(
					[inlineFinding, fallbackFinding],
					EXEC_CLI_FINDINGS_ENVELOPE_OPTIONS,
				),
				github: gateway,
			},
		);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain(
			"inline findings: posted=1 skipped_duplicate=0 fallback_only=1 api_error=none",
		);
		expect(run.stderr).toContain("posted findings comment");

		const createdReview = gateway.createdReviews()[0];
		expect(createdReview?.comments).toHaveLength(1);
		expect(createdReview?.comments[0]?.body).toContain("<!-- roaster-inline:dignified-python:");

		const comment = await findSummaryComment(gateway, "<!-- roaster:dignified-python -->");
		expect(comment?.body).toContain("<!-- roaster:dignified-python -->");
		expect(comment?.body).toContain("### Inline posting");
		expect(comment?.body).toContain("Inline comments posted:** 1");
		expect(comment?.body).toContain("Summary-only findings:** 1");
		expect(comment?.body).toContain("| ⚠️ warning | `app.py` | 1 | Inline this |");
		expect(comment?.body).toContain("### Activity Log");
		expect(comment?.body).toContain("https://run");
	});

	test("publish-findings skips duplicate inline markers while updating the summary", async () => {
		const firstGateway = new FakeRoasterGitHubGateway({ changedFilesByPr: changedFiles });
		const first = await runRoaster(["exec", "publish-findings", "--pr-number", "47"], {
			stdin: buildFindingsEnvelope([inlineFinding], EXEC_CLI_FINDINGS_ENVELOPE_OPTIONS),
			github: firstGateway,
		});
		expect(first.exitCode).toBe(0);
		const markerBody = firstGateway.createdReviews()[0]?.comments[0]?.body ?? "";
		expect(markerBody).toContain("<!-- roaster-inline:dignified-python:");

		const reviewComments = new Map<number, readonly PRReviewComment[]>([
			[47, [{ author: "github-actions[bot]", body: markerBody }]],
		]);
		const discussionComments = new Map<
			number,
			readonly (PRDiscussionComment & { readonly author: string })[]
		>([
			[
				47,
				[
					{
						id: 1,
						body: "<!-- roaster:dignified-python -->\nold\n\n### Activity Log\n\n- old run\n",
						author: "github-actions[bot]",
					},
				],
			],
		]);
		const duplicateGateway = new FakeRoasterGitHubGateway({
			changedFilesByPr: changedFiles,
			reviewCommentsByPr: reviewComments,
			discussionCommentsByPr: discussionComments,
		});
		const duplicate = await runRoaster(["exec", "publish-findings", "--pr-number", "47"], {
			stdin: buildFindingsEnvelope([inlineFinding], EXEC_CLI_FINDINGS_ENVELOPE_OPTIONS),
			github: duplicateGateway,
		});
		expect(duplicate.exitCode).toBe(0);
		expect(duplicate.stderr).toContain(
			"inline findings: posted=0 skipped_duplicate=1 fallback_only=0 api_error=none",
		);
		expect(duplicate.stderr).toContain("updated findings comment");
		expect(duplicateGateway.createdReviews()).toHaveLength(0);
		const comment = await findSummaryComment(duplicateGateway, "<!-- roaster:dignified-python -->");
		expect(comment?.body).toContain("Duplicate inline comments skipped:** 1");
		expect(comment?.body).toContain("- old run");
	});

	test("publish-findings treats summary discussion write errors as fatal", async () => {
		const gateway = new FailingDiscussionGateway({ changedFilesByPr: changedFiles });
		const run = await runRoaster(["exec", "publish-findings", "--pr-number", "47"], {
			stdin: buildFindingsEnvelope([inlineFinding], EXEC_CLI_FINDINGS_ENVELOPE_OPTIONS),
			github: gateway,
		});
		expect(run.exitCode).toBe(1);
		expect(run.stderr).toContain("publish-findings: discussion write failed");
	});

	test("publish-findings treats inline posting API errors as non-fatal summary state", async () => {
		const gateway = new ThrowingCreateReviewGateway({ changedFilesByPr: changedFiles });
		const run = await runRoaster(["exec", "publish-findings", "--pr-number", "47"], {
			stdin: buildFindingsEnvelope([inlineFinding], EXEC_CLI_FINDINGS_ENVELOPE_OPTIONS),
			github: gateway,
		});
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toContain("api_error=validation failed");
		expect(run.stderr).toContain("posted findings comment");
		const comment = await findSummaryComment(gateway, "<!-- roaster:dignified-python -->");
		expect(comment?.body).toContain("API error:** validation failed");
	});
});
