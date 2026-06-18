import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
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
} from "../../src/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

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
	const exitCode = await runCli(args, {
		context: fakeRoasterContext({ github: options.github }),
		cwd: "/repo",
		env: {},
		stdin: async () => options.stdin ?? "",
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

function findingsEnvelope(findings: readonly Record<string, unknown>[]): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			reviewName: "dignified-python",
			reviewPath: "/repo/reviews/dignified-python.md",
			model: "sonnet",
			baseRef: "master",
			format: "findings",
			count: findings.length,
			findings,
			usage: null,
			inputCoverage: null,
		},
	});
}

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
} as const;

class ThrowingCreateReviewGateway extends FakeRoasterGitHubGateway {
	override async createPrReview(
		_prNumber: number,
		_comments: readonly PRInlineCommentInput[],
		_options: GitHubGatewayOptions,
	): Promise<never> {
		throw new Error("validation failed");
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

describe("roaster exec CLI", () => {
	test("exec help lists hidden commands", async () => {
		const run = await runRoaster(["exec", "--help"]);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("post-inline-findings");
		expect(run.stdout).toContain("format-findings-comment");
		expect(run.stdout).toContain("post-findings-comment");
	});

	test("format-findings-comment renders findings from stdin", async () => {
		const run = await runRoaster(["exec", "format-findings-comment"], {
			stdin: findingsEnvelope([inlineFinding]),
		});
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("<!-- roaster:dignified-python -->");
		expect(run.stdout).toContain("## roaster · `dignified-python`");
		expect(run.stdout).toContain("| ⚠️ warning | `app.py` | 1 | Inline this |");
	});

	test("format-findings-comment rejects malformed stdin", async () => {
		const run = await runRoaster(["exec", "format-findings-comment"], { stdin: "not json" });
		expect(run.exitCode).toBe(1);
		expect(run.stderr).toContain("valid JSON");
	});

	test("post-inline-findings no-ops for empty and failed run envelopes", async () => {
		const empty = await runRoaster(["exec", "post-inline-findings", "--pr-number", "47"], {
			stdin: findingsEnvelope([]),
			github: new UnexpectedInlineQueryGateway(),
		});
		expect(empty.exitCode).toBe(0);
		expect(JSON.parse(empty.stdout)).toMatchObject({
			postedCount: 0,
			fallbackOnlyCount: 0,
			apiError: null,
		});

		const failed = await runRoaster(["exec", "post-inline-findings", "--pr-number", "47"], {
			stdin: failedEnvelope(),
			github: new UnexpectedInlineQueryGateway(),
		});
		expect(failed.exitCode).toBe(0);
		expect(JSON.parse(failed.stdout)).toMatchObject({
			postedCount: 0,
			fallbackOnlyCount: 0,
			apiError: null,
		});
	});

	test("post-inline-findings posts inlineable findings and skips duplicate markers", async () => {
		const changedFiles = new Map<number, readonly PRChangedFile[]>([
			[47, [{ path: "app.py", status: "modified", patch: "@@ -1 +1 @@\n+new" }]],
		]);
		const firstGateway = new FakeRoasterGitHubGateway({ changedFilesByPr: changedFiles });
		const first = await runRoaster(["exec", "post-inline-findings", "--pr-number", "47"], {
			stdin: findingsEnvelope([inlineFinding]),
			github: firstGateway,
		});
		expect(first.exitCode).toBe(0);
		expect(JSON.parse(first.stdout)).toMatchObject({ postedCount: 1, skippedDuplicateCount: 0 });
		const markerBody = firstGateway.createdReviews()[0]?.comments[0]?.body ?? "";
		expect(markerBody).toContain("<!-- roaster-inline:dignified-python:");

		const reviewComments = new Map<number, readonly PRReviewComment[]>([
			[47, [{ author: "github-actions[bot]", body: markerBody }]],
		]);
		const duplicateGateway = new FakeRoasterGitHubGateway({
			changedFilesByPr: changedFiles,
			reviewCommentsByPr: reviewComments,
		});
		const duplicate = await runRoaster(["exec", "post-inline-findings", "--pr-number", "47"], {
			stdin: findingsEnvelope([inlineFinding]),
			github: duplicateGateway,
		});
		expect(duplicate.exitCode).toBe(0);
		expect(JSON.parse(duplicate.stdout)).toMatchObject({
			postedCount: 0,
			skippedDuplicateCount: 1,
		});
		expect(duplicateGateway.createdReviews()).toHaveLength(0);

		const humanReviewComments = new Map<number, readonly PRReviewComment[]>([
			[47, [{ author: "alice", body: markerBody }]],
		]);
		const humanQuotedGateway = new FakeRoasterGitHubGateway({
			changedFilesByPr: changedFiles,
			reviewCommentsByPr: humanReviewComments,
		});
		const humanQuoted = await runRoaster(["exec", "post-inline-findings", "--pr-number", "47"], {
			stdin: findingsEnvelope([inlineFinding]),
			github: humanQuotedGateway,
		});
		expect(humanQuoted.exitCode).toBe(0);
		expect(JSON.parse(humanQuoted.stdout)).toMatchObject({
			postedCount: 1,
			skippedDuplicateCount: 0,
		});
	});

	test("post-inline-findings preserves fallback-only reasons and API errors", async () => {
		const changedFiles = new Map<number, readonly PRChangedFile[]>([
			[47, [{ path: "app.py", status: "modified", patch: "@@ -1 +1 @@\n+new" }]],
		]);
		const gateway = new ThrowingCreateReviewGateway({ changedFilesByPr: changedFiles });
		const fallback = {
			path: "other.py",
			line: 10,
			severity: "info",
			summary: "Fallback",
			details: "Not changed.",
		};
		const run = await runRoaster(["exec", "post-inline-findings", "--pr-number", "47"], {
			stdin: findingsEnvelope([inlineFinding, fallback]),
			github: gateway,
		});
		expect(run.exitCode).toBe(0);
		const data = JSON.parse(run.stdout);
		expect(data.postedCount).toBe(0);
		expect(data.fallbackOnlyCount).toBe(1);
		expect(data.fallbackOnly[0].reason).toBe("file_not_changed");
		expect(data.apiError).toBe("validation failed");
	});

	test("format-findings-comment includes inline result file status", async () => {
		const inlineStatus = JSON.stringify({
			postedCount: 1,
			skippedDuplicateCount: 2,
			fallbackOnlyCount: 3,
			apiError: "validation failed",
			fallbackOnly: [],
		});
		const path = `/tmp/roaster-inline-status-${process.pid}-${Math.random()}.json`;
		await import("node:fs/promises").then((fs) => fs.writeFile(path, inlineStatus, "utf8"));
		const run = await runRoaster(
			["exec", "format-findings-comment", "--inline-result-file", path],
			{ stdin: findingsEnvelope([inlineFinding]) },
		);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("Inline comments posted:** 1");
		expect(run.stdout).toContain("API error:** validation failed");
	});

	test("post-findings-comment creates and updates bot comments", async () => {
		const gateway = new FakeRoasterGitHubGateway();
		const body = "<!-- roaster:dignified-python -->\n## roaster · `dignified-python`\n";
		const created = await runRoaster(
			["exec", "post-findings-comment", "--pr-number", "47", "--run-url", "https://run"],
			{ stdin: body, github: gateway },
		);
		expect(created.exitCode).toBe(0);
		expect(created.stderr).toContain("posted findings comment");

		const comments = new Map<
			number,
			readonly (PRDiscussionComment & { readonly author: string })[]
		>([
			[
				47,
				[
					{
						id: 1,
						body: "<!-- roaster:dignified-python -->\nold\n",
						author: "github-actions[bot]",
					},
				],
			],
		]);
		const updateGateway = new FakeRoasterGitHubGateway({ discussionCommentsByPr: comments });
		const updated = await runRoaster(["exec", "post-findings-comment", "--pr-number", "47"], {
			stdin: "<!-- roaster:dignified-python -->\nnew\n",
			github: updateGateway,
		});
		expect(updated.exitCode).toBe(0);
		expect(updated.stderr).toContain("updated findings comment");
	});

	test("post-findings-comment rejects body without first-line marker", async () => {
		const run = await runRoaster(["exec", "post-findings-comment", "--pr-number", "47"], {
			stdin: "no marker\n",
		});
		expect(run.exitCode).toBe(1);
		expect(run.stderr).toContain("marker");
	});
});
