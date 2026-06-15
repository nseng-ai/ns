import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadReference, type PayloadResult } from "../../src/payload-store.ts";
import { prBatchArtifactDescriptor } from "../../src/session-artifacts.ts";
import { REPO_ROOT } from "../support/golden.ts";
import { runScenario } from "../support/run-scenario.ts";
import { InMemoryPrAddressGitGateway, InMemoryPrAddressGitHubGateway, prSummary } from "../support/in-memory-pr-address-gateways.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok payload result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

async function seedResolveBuildArtifact(options: {
	root: string;
	sessionId: string;
	prNumber?: number | undefined;
	batchId?: string | undefined;
	payload: unknown;
	payloadReady?: boolean | undefined;
	continueOnError?: boolean | undefined;
}): Promise<PayloadReference> {
	const prNumber = options.prNumber ?? 42;
	const batchId = options.batchId ?? "local";
	const store = expectOk(await PayloadStore.open({ root: options.root, sessionId: options.sessionId }));
	const sourcePlan = expectOk(await store.writeJsonArtifact({ descriptor: "source-plan", role: "summary", payload: { valid: true } }));
	return expectOk(
		await store.writeJsonArtifact({
			descriptor: prBatchArtifactDescriptor({ prNumber, batchId, kind: "resolve-build" }),
			role: "summary",
			payload: {
				artifact_kind: "resolve_build",
				pr_number: prNumber,
				batch_id: batchId,
				source_plan: sourcePlan,
				build: {
					valid: true,
					payload_ready: options.payloadReady ?? true,
					batch_id: batchId,
					commit_sha: null,
					continue_on_error: options.continueOnError ?? false,
					review_thread_count: 1,
					resolved_thread_count: Array.isArray((options.payload as { items?: unknown[] }).items) ? (options.payload as { items: unknown[] }).items.length : 0,
					skipped_thread_count: 0,
					ignored_non_thread_items: [],
					skipped_items: [],
					payload: options.payload,
					errors: [],
					warnings: [],
				},
			},
		}),
	);
}

describe("mutation operations use fake gateways", () => {
	test("mutation positional integers reject non-decimal forms before mutation", async () => {
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
		const reviewGithub = new InMemoryPrAddressGitHubGateway();
		const review = runScenario(["exec", "reply-to-review", "42", "reviewer", "--format", "json", "--", "- Updated tests"], { cwd: REPO_ROOT, github: reviewGithub });
		expect(await review.exit).toBe(0);
		const reviewBody = JSON.parse(review.stdout.join("")).data.body as string;
		expect(reviewBody).toContain("Addressed review feedback from @reviewer:");
		expect(reviewBody).toContain("- Updated tests");
		expect(reviewGithub.comments).toEqual([{ prNumber: 42, body: reviewBody }]);

		const github = new InMemoryPrAddressGitHubGateway({ reactionFailureCommentIds: new Set([9001]) });
		const discussion = runScenario(["exec", "reply-to-discussion", "42", "9001", "reviewer", "Can you update this?", "Done.", "--format", "json"], { cwd: REPO_ROOT, github });
		expect(await discussion.exit).toBe(0);
		const data = JSON.parse(discussion.stdout.join("")).data;
		expect(data.reaction_added).toBe(false);
		expect(data.warning).toContain("Failed to add reaction to comment 9001");
		expect(github.comments[0]?.body).toContain("> @reviewer wrote:");
	});

	test("resolve-thread-with-reply validates before mutation and applies valid planned provenance", async () => {
		const invalidGithub = new InMemoryPrAddressGitHubGateway();
		const invalid = runScenario(["exec", "resolve-thread-with-reply", "PRRT_bad", "fixed", "Fixed.", "abc123", "--provenance-json", '{"kind":"local_branch","branch":"reuse-worker"}', "--format", "json"], { cwd: REPO_ROOT, github: invalidGithub });
		expect(await invalid.exit).toBe(2);
		expect(JSON.parse(invalid.stdout.join("")).error_type).toBe("invalid_request");
		expect(invalidGithub.threadReplies).toEqual([]);
		expect(invalidGithub.resolvedThreadIds).toEqual([]);

		const github = new InMemoryPrAddressGitHubGateway({ prs: [prSummary({ number: 1073, url: "https://github.example/pr/1073", head_ref_name: "follow-up", head_ref_oid: "def5678" })] });
		const planned = runScenario(["exec", "resolve-thread-with-reply", "PRRT_plan", "planned", "Follow-up PR tracks this.", "", "--provenance-json", '{"kind":"pr","pr_number":1073}', "--format", "json"], { cwd: REPO_ROOT, github });
		expect(await planned.exit).toBe(0);
		const data = JSON.parse(planned.stdout.join("")).data;
		expect(data.body).toContain("- PR head snapshot: `follow-up` at `def5678`");
		expect(github.threadReplies.map((reply) => reply.threadId)).toEqual(["PRRT_plan"]);
		expect(github.resolvedThreadIds).toEqual(["PRRT_plan"]);
	});

	test("resolve-thread-batch requires an explicit build artifact", async () => {
		const github = new InMemoryPrAddressGitHubGateway();
		const run = runScenario(["exec", "resolve-thread-batch", "--format", "json"], { cwd: REPO_ROOT, github });

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join(""));
		expect(envelope.error_type).toBe("explicit_artifact_required");
		expect(github.threadReplies).toEqual([]);
		expect(github.resolvedThreadIds).toEqual([]);
	});

	test("resolve-thread-batch validates artifact payload before any mutation", async () => {
		const root = join(await makeTempDir("pr-address-mutation-"), "payload-root");
		const reference = await seedResolveBuildArtifact({ root, sessionId: "sess-mutation", payload: { commit_sha: "abc123", items: [{ thread_id: "PRRT_fixed", mode: "fixed", message: " " }] } });
		const github = new InMemoryPrAddressGitHubGateway();
		const run = runScenario(["exec", "resolve-thread-batch", "--from-build", String(reference.sequence), "--format", "json"], {
			cwd: REPO_ROOT,
			github,
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "sess-mutation" },
		});

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join("")).message).toContain("message");
		expect(github.threadReplies).toEqual([]);
		expect(github.resolvedThreadIds).toEqual([]);
	});

	test("resolve-thread-batch validates all provenance before first mutation", async () => {
		const root = join(await makeTempDir("pr-address-mutation-"), "payload-root");
		const reference = await seedResolveBuildArtifact({
			root,
			sessionId: "sess-provenance",
			payload: { items: [{ thread_id: "PRRT_first", mode: "pre_existing" }, { thread_id: "PRRT_missing", mode: "planned", message: "Later.", provenance: { kind: "local_branch", branch: "missing" } }] },
		});
		const github = new InMemoryPrAddressGitHubGateway();
		const git = new InMemoryPrAddressGitGateway({ branchHeadOids: { "reuse-worker": "abc1234" } });
		const run = runScenario(["exec", "resolve-thread-batch", "--from-build", String(reference.sequence), "--format", "json"], { cwd: REPO_ROOT, github, git, env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "sess-provenance" } });

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join("")).message).toContain("does not exist");
		expect(github.threadReplies).toEqual([]);
		expect(github.resolvedThreadIds).toEqual([]);
	});

	test("resolve-thread-batch writes resolution artifact for partial gateway failures", async () => {
		const root = join(await makeTempDir("pr-address-mutation-"), "payload-root");
		const reference = await seedResolveBuildArtifact({
			root,
			sessionId: "sess-partial",
			payload: { commit_sha: "abc1234", items: [{ thread_id: "PRRT_ok", mode: "fixed", message: "Fixed." }, { thread_id: "PRRT_fail", mode: "fixed", message: "Fails." }, { thread_id: "PRRT_skip", mode: "fixed", message: "Skipped." }] },
		});
		const github = new InMemoryPrAddressGitHubGateway({ threadReplyFailureIds: new Set(["PRRT_fail"]) });

		const run = runScenario(["exec", "resolve-thread-batch", "--from-build", String(reference.sequence), "--format", "json"], {
			cwd: REPO_ROOT,
			github,
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "sess-partial" },
		});

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join(""));
		expect(envelope.data.resolved).toBe(1);
		expect(envelope.data.failed).toBe(1);
		expect(envelope.data.skipped).toBe(1);
		expect(envelope.data.resolution_reference.descriptor).toBe("pr-address-pr-42-batch-local-thread-resolution");
		expect(envelope.data.results.map((result: { status: string }) => result.status)).toEqual(["resolved", "failed", "skipped"]);
		expect(github.threadReplies.map((reply) => reply.threadId)).toEqual(["PRRT_ok"]);
		expect(github.resolvedThreadIds).toEqual(["PRRT_ok"]);
		const files = await readdir(join(root, "sessions", "sess-partial", "payloads"));
		expect(files.some((file) => file.includes("thread-resolution.summary.json"))).toBe(true);
	});
});
