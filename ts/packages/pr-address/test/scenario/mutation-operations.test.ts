import { describe, expect, test } from "vitest";

import { REPO_ROOT } from "../support/golden.ts";
import { runScenario } from "../support/run-scenario.ts";
import { InMemoryPrAddressGitGateway, InMemoryPrAddressGitHubGateway, prSummary } from "../support/in-memory-pr-address-gateways.ts";

describe("mutation operations use fake gateways", () => {
	test("mutation positional integers reject non-decimal forms before mutation", async () => {
		// PINNED CLINKR SEMANTICS: strict-int rejection is a raw commander usage
		// error (stderr, exit 2), never a machine envelope — click parity.
		const reviewGithub = new InMemoryPrAddressGitHubGateway();
		const review = runScenario(["exec", "reply-to-review", "1e2", "reviewer", "Done.", "--format", "json"], { cwd: REPO_ROOT, github: reviewGithub });
		expect(await review.exit).toBe(2);
		expect(review.stdout.join("")).toBe("");
		expect(review.stderr.join("")).toContain("expected an integer");
		expect(reviewGithub.comments).toEqual([]);

		const discussionGithub = new InMemoryPrAddressGitHubGateway();
		const discussion = runScenario(["exec", "reply-to-discussion", "42", "0x10", "reviewer", "Original", "Done.", "--format", "json"], { cwd: REPO_ROOT, github: discussionGithub });
		expect(await discussion.exit).toBe(2);
		expect(discussion.stdout.join("")).toBe("");
		expect(discussion.stderr.join("")).toContain("expected an integer");
		expect(discussionGithub.comments).toEqual([]);
	});

	test("reply builders post formatted comments and preserve reaction warning success", async () => {
		// Options must precede `--` (click parity); everything after it is positional.
		const reviewGithub = new InMemoryPrAddressGitHubGateway();
		const review = runScenario(["exec", "reply-to-review", "42", "reviewer", "--format", "json", "--", "- Updated tests"], { cwd: REPO_ROOT, github: reviewGithub });
		expect(await review.exit).toBe(0);
		const reviewBody = JSON.parse(review.stdout.join("")).data.body as string;
		expect(reviewBody).toContain("Addressed review feedback from @reviewer:");
		expect(reviewBody).toContain("- Updated tests");
		expect(reviewGithub.comments).toEqual([{ prNumber: 42, body: reviewBody }]);

		const github = new InMemoryPrAddressGitHubGateway({ reactionFailureCommentIds: new Set([9001]) });
		const discussion = runScenario(
			["exec", "reply-to-discussion", "42", "9001", "reviewer", "Can you update this?", "Done.", "--format", "json"],
			{ cwd: REPO_ROOT, github },
		);
		expect(await discussion.exit).toBe(0);
		const data = JSON.parse(discussion.stdout.join("")).data;
		expect(data.reaction_added).toBe(false);
		expect(data.warning).toContain("Failed to add reaction to comment 9001");
		expect(github.comments[0]?.body).toContain("> @reviewer wrote:");
	});

	test("resolve-thread-with-reply validates before mutation and applies valid planned provenance", async () => {
		const invalidGithub = new InMemoryPrAddressGitHubGateway();
		const invalid = runScenario(
			["exec", "resolve-thread-with-reply", "PRRT_bad", "fixed", "Fixed.", "abc123", "--provenance-json", '{"kind":"local_branch","branch":"reuse-worker"}', "--format", "json"],
			{ cwd: REPO_ROOT, github: invalidGithub },
		);
		expect(await invalid.exit).toBe(2);
		expect(JSON.parse(invalid.stdout.join("")).error_type).toBe("invalid_request");
		expect(invalidGithub.threadReplies).toEqual([]);
		expect(invalidGithub.resolvedThreadIds).toEqual([]);

		const github = new InMemoryPrAddressGitHubGateway({ prs: [prSummary({ number: 1073, url: "https://github.example/pr/1073", head_ref_name: "follow-up", head_ref_oid: "def5678" })] });
		const planned = runScenario(
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
			{ cwd: REPO_ROOT, github },
		);
		expect(await planned.exit).toBe(0);
		const data = JSON.parse(planned.stdout.join("")).data;
		expect(data.body).toContain("- PR head snapshot: `follow-up` at `def5678`");
		expect(github.threadReplies.map((reply) => reply.threadId)).toEqual(["PRRT_plan"]);
		expect(github.resolvedThreadIds).toEqual(["PRRT_plan"]);
	});

	test("resolve-thread-batch rejects invalid payload before any mutation", async () => {
		const github = new InMemoryPrAddressGitHubGateway();
		const run = runScenario(
			[
				"exec",
				"resolve-thread-batch",
				"--payload-json",
				JSON.stringify({ commit_sha: "abc123", items: [{ thread_id: "PRRT_fixed", mode: "fixed", message: " " }] }),
				"--format",
				"json",
			],
			{ cwd: REPO_ROOT, github },
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
		const run = runScenario(["exec", "resolve-thread-batch", "--payload-json", JSON.stringify(payload), "--format", "json"], { cwd: REPO_ROOT, github, git });

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

		const run = runScenario(["exec", "resolve-thread-batch", "--payload-json", JSON.stringify(payload), "--format", "json"], { cwd: REPO_ROOT, github });

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
