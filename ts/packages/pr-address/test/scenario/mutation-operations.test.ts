import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runCli, type CliDeps } from "../../src/cli.ts";
import { formatDiscussionReply, formatResolutionReply, formatReviewReply } from "../../src/reply-formatting.ts";
import type { ResolutionProvenance } from "../../src/reply-formatting.ts";
import { InMemoryPrAddressGitGateway, InMemoryPrAddressGitHubGateway, prSummary } from "../support/in-memory-pr-address-gateways.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const GOLDEN_ROOT = fileURLToPath(new URL("../fixtures/golden/v1", import.meta.url));
const FIXED_REPLY_TIMESTAMP = "2026-06-01T12:34:56Z";

interface GoldenCase {
	name: string;
	inputPath: string;
	expectedPath: string;
}

const replyFormattingCases = await goldenCases("reply-formatting");

function runWithFakes(args: readonly string[], deps: Pick<CliDeps, "stdin"> & { github?: InMemoryPrAddressGitHubGateway; git?: InMemoryPrAddressGitGateway } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const github = deps.github ?? new InMemoryPrAddressGitHubGateway();
	const git = deps.git ?? new InMemoryPrAddressGitGateway();
	return {
		exit: runCli(args, {
			context: { github, git },
			cwd: REPO_ROOT,
			env: { PATH: "/fake/bin" },
			stdin: deps.stdin,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		github,
		git,
	};
}

async function goldenCases(operation: string): Promise<GoldenCase[]> {
	const operationDir = join(GOLDEN_ROOT, operation);
	const entries = await readdir(operationDir, { withFileTypes: true });
	const cases = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({
			name: entry.name,
			inputPath: join(operationDir, entry.name, "input.json"),
			expectedPath: join(operationDir, entry.name, "expected.json"),
		}));
	cases.sort((left, right) => left.name.localeCompare(right.name));
	return cases;
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8"));
}

function formatGoldenReply(input: unknown): string {
	if (!isRecord(input)) throw new Error("golden input must be an object");
	const functionName = input.function;
	const kwargs = input.kwargs;
	if (typeof functionName !== "string" || !isRecord(kwargs)) throw new Error("golden input missing function/kwargs");
	if (functionName === "resolution_reply") {
		return formatResolutionReply({
			mode: resolutionMode(kwargs.mode),
			message: nullableString(kwargs.message),
			commitSha: nullableString(kwargs.commit_sha),
			provenance: provenanceField(kwargs.provenance),
			timestamp: FIXED_REPLY_TIMESTAMP,
		});
	}
	if (functionName === "review_reply") {
		return formatReviewReply({ reviewAuthor: stringField(kwargs.review_author), summaryMarkdown: stringField(kwargs.summary_markdown), timestamp: FIXED_REPLY_TIMESTAMP });
	}
	if (functionName === "discussion_reply") {
		return formatDiscussionReply({ commentAuthor: stringField(kwargs.comment_author), originalBody: stringField(kwargs.original_body), response: stringField(kwargs.response), timestamp: FIXED_REPLY_TIMESTAMP });
	}
	throw new Error(`Unsupported reply formatting function: ${functionName}`);
}

describe("reply formatting TypeScript parity", () => {
	for (const goldenCase of replyFormattingCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(formatGoldenReply(input)).toEqual(expected);
		});
	}
});

describe("mutation operations use fake gateways", () => {
	test("add-issue-comment, add-reaction, thread resolve, unresolve, and reply mutations call fakes", async () => {
		const addIssue = runWithFakes(["exec", "add-issue-comment", "42", "Addressed.", "--format", "json"]);
		expect(await addIssue.exit).toBe(0);
		expect(JSON.parse(addIssue.stdout.join("")).data.comment.body).toBe("Addressed.");
		expect(addIssue.github.comments).toEqual([{ prNumber: 42, body: "Addressed." }]);

		const addReaction = runWithFakes(["exec", "add-reaction", "9001", "--", "-1", "--format", "json"]);
		expect(await addReaction.exit).toBe(0);
		expect(JSON.parse(addReaction.stdout.join("")).data.content).toBe("-1");
		expect(addReaction.github.reactions).toEqual([{ commentId: 9001, reaction: "-1" }]);

		const addThreadReply = runWithFakes(["exec", "add-review-thread-reply", "PRRT_abc", "Fixed.", "--format", "json"]);
		expect(await addThreadReply.exit).toBe(0);
		expect(JSON.parse(addThreadReply.stdout.join("")).data.comment.body).toBe("Fixed.");
		expect(addThreadReply.github.threadReplies).toEqual([{ threadId: "PRRT_abc", body: "Fixed." }]);

		const resolve = runWithFakes(["exec", "resolve-thread", "PRRT_abc", "--format", "json"]);
		expect(await resolve.exit).toBe(0);
		expect(JSON.parse(resolve.stdout.join("")).data.is_resolved).toBe(true);
		expect(resolve.github.resolvedThreadIds).toEqual(["PRRT_abc"]);

		const unresolve = runWithFakes(["exec", "unresolve-thread", "PRRT_abc", "--format", "json"]);
		expect(await unresolve.exit).toBe(0);
		expect(JSON.parse(unresolve.stdout.join("")).data.is_resolved).toBe(false);
		expect(unresolve.github.unresolvedThreadIds).toEqual(["PRRT_abc"]);
	});

	test("reply builders post formatted comments and preserve reaction warning success", async () => {
		const review = runWithFakes(["exec", "reply-to-review", "42", "reviewer", "--", "- Updated tests", "--format", "json"]);
		expect(await review.exit).toBe(0);
		const reviewBody = JSON.parse(review.stdout.join("")).data.body as string;
		expect(reviewBody).toContain("Addressed review feedback from @reviewer:");
		expect(reviewBody).toContain("- Updated tests");
		expect(review.github.comments).toEqual([{ prNumber: 42, body: reviewBody }]);

		const github = new InMemoryPrAddressGitHubGateway({ reactionFailureCommentIds: new Set([9001]) });
		const discussion = runWithFakes(
			["exec", "reply-to-discussion", "42", "9001", "reviewer", "Can you update this?", "Done.", "--format", "json"],
			{ github },
		);
		expect(await discussion.exit).toBe(0);
		const data = JSON.parse(discussion.stdout.join("")).data;
		expect(data.reaction_added).toBe(false);
		expect(data.warning).toContain("Failed to add reaction to comment 9001");
		expect(github.comments[0]?.body).toContain("> @reviewer wrote:");
	});

	test("resolve-thread-with-reply validates before mutation and applies valid planned provenance", async () => {
		const invalid = runWithFakes(["exec", "resolve-thread-with-reply", "PRRT_bad", "fixed", "Fixed.", "abc123", "--provenance-json", '{"kind":"local_branch","branch":"reuse-worker"}', "--format", "json"]);
		expect(await invalid.exit).toBe(2);
		expect(JSON.parse(invalid.stdout.join("")).error_type).toBe("invalid_request");
		expect(invalid.github.threadReplies).toEqual([]);
		expect(invalid.github.resolvedThreadIds).toEqual([]);

		const github = new InMemoryPrAddressGitHubGateway({ prs: [prSummary({ number: 1073, url: "https://github.example/pr/1073", head_ref_name: "follow-up", head_ref_oid: "def5678" })] });
		const planned = runWithFakes(
			[
				"exec",
				"resolve-thread-with-reply",
				"PRRT_plan",
				"planned",
				"Follow-up PR tracks this.",
				"",
				"--provenance-json",
				'{"kind":"pr","pr_number":1073}',
				"--format",
				"json",
			],
			{ github },
		);
		expect(await planned.exit).toBe(0);
		const data = JSON.parse(planned.stdout.join("")).data;
		expect(data.body).toContain("- PR head snapshot: `follow-up` at `def5678`");
		expect(github.threadReplies.map((reply) => reply.threadId)).toEqual(["PRRT_plan"]);
		expect(github.resolvedThreadIds).toEqual(["PRRT_plan"]);
	});

	test("resolve-thread-batch rejects invalid payload before any mutation", async () => {
		const github = new InMemoryPrAddressGitHubGateway();
		const run = runWithFakes(
			[
				"exec",
				"resolve-thread-batch",
				"--payload-json",
				JSON.stringify({ commit_sha: "abc123", items: [{ thread_id: "PRRT_fixed", mode: "fixed", message: " " }] }),
				"--format",
				"json",
			],
			{ github },
		);

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join("")).message).toContain("message");
		expect(github.threadReplies).toEqual([]);
		expect(github.resolvedThreadIds).toEqual([]);
	});

	test("resolve-thread-batch validates all provenance before first mutation", async () => {
		const github = new InMemoryPrAddressGitHubGateway();
		const git = new InMemoryPrAddressGitGateway({ branchHeadOids: { "reuse-worker": "abc1234" } });
		const payload = {
			items: [
				{ thread_id: "PRRT_first", mode: "pre_existing" },
				{ thread_id: "PRRT_missing", mode: "planned", message: "Later.", provenance: { kind: "local_branch", branch: "missing" } },
			],
		};
		const run = runWithFakes(["exec", "resolve-thread-batch", "--payload-json", JSON.stringify(payload), "--format", "json"], { github, git });

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join("")).message).toContain("does not exist");
		expect(github.threadReplies).toEqual([]);
		expect(github.resolvedThreadIds).toEqual([]);
	});

	test("resolve-thread-batch returns partial negative data and skips by default on gateway failure", async () => {
		const github = new InMemoryPrAddressGitHubGateway({ threadReplyFailureIds: new Set(["PRRT_fail"]) });
		const payload = {
			commit_sha: "abc1234",
			items: [
				{ thread_id: "PRRT_ok", mode: "fixed", message: "Fixed." },
				{ thread_id: "PRRT_fail", mode: "fixed", message: "Fails." },
				{ thread_id: "PRRT_skip", mode: "fixed", message: "Skipped." },
			],
		};

		const run = runWithFakes(["exec", "resolve-thread-batch", "--payload-json", JSON.stringify(payload), "--format", "json"], { github });

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join(""));
		expect(envelope.data.resolved).toBe(1);
		expect(envelope.data.failed).toBe(1);
		expect(envelope.data.skipped).toBe(1);
		expect(envelope.data.results.map((result: { status: string }) => result.status)).toEqual(["resolved", "failed", "skipped"]);
		expect(github.threadReplies.map((reply) => reply.threadId)).toEqual(["PRRT_ok"]);
		expect(github.resolvedThreadIds).toEqual(["PRRT_ok"]);
	});
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string {
	if (typeof value !== "string") throw new Error("expected string field");
	return value;
}

function nullableString(value: unknown): string | null {
	if (value === null) return null;
	return stringField(value);
}

function nullableOptionalString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return stringField(value);
}

function provenanceField(value: unknown): ResolutionProvenance | null {
	if (value === null || value === undefined) return null;
	if (!isRecord(value)) throw new Error("expected provenance object");
	if (value.kind === "local_branch") {
		return { kind: "local_branch", branch: stringField(value.branch), branch_head_oid: stringField(value.branch_head_oid) };
	}
	if (value.kind === "pr") {
		const prNumber = value.pr_number;
		if (typeof prNumber !== "number") throw new Error("expected pr_number");
		return {
			kind: "pr",
			pr_number: prNumber,
			pr_url: stringField(value.pr_url),
			pr_state: stringField(value.pr_state),
			pr_head_ref_name: stringField(value.pr_head_ref_name),
			pr_head_ref_oid: nullableOptionalString(value.pr_head_ref_oid),
		};
	}
	throw new Error("expected provenance kind");
}

function resolutionMode(value: unknown) {
	if (value === "fixed" || value === "pre_existing" || value === "explained" || value === "planned") return value;
	throw new Error("expected resolution mode");
}
