import { describe, expect, test } from "vitest";

import type {
	StackViewCheckEntry,
	StackViewThreadComment,
	StackViewThreadDetail,
} from "../../src/stack-view/types.ts";
import { checkEnrichmentKey, threadEnrichmentKey } from "../../src/stack-view/enrichment-keys.ts";
import {
	createEnrichmentStore,
	type EnrichmentEntry,
} from "../../src/stack-view/enrichment-store.ts";
import {
	buildCheckSummaryPrompt,
	buildThreadSummaryPrompt,
	CHECK_LOG_TAIL_MAX_CHARS,
	THREAD_COMMENT_BODY_MAX_CHARS,
	THREAD_USER_TEXT_MAX_CHARS,
} from "../../src/stack-view/enrichment-prompts.ts";

function commentFixture(overrides?: Partial<StackViewThreadComment>): StackViewThreadComment {
	return {
		id: "C_1",
		author: "alice",
		body: "please rename this",
		createdAt: "2026-07-01T00:00:00Z",
		...overrides,
	};
}

function threadFixture(overrides?: Partial<StackViewThreadDetail>): StackViewThreadDetail {
	const comments = overrides?.comments ?? [commentFixture()];
	return {
		id: "RT_1",
		path: "src/foo.ts",
		line: 42,
		author: "alice",
		comments,
		lastCommentId: comments.at(-1)?.id ?? null,
		totalComments: comments.length,
		...overrides,
	};
}

function checkFixture(overrides?: Partial<StackViewCheckEntry>): StackViewCheckEntry {
	return {
		name: "typecheck",
		workflowName: "CI",
		bucket: "failing",
		status: "COMPLETED",
		conclusion: "FAILURE",
		detailsUrl: "https://example.test/run/1",
		identity: "CI/typecheck",
		...overrides,
	};
}

describe("enrichment keys", () => {
	test("thread key is stable for the same thread", () => {
		const thread = threadFixture();
		expect(threadEnrichmentKey(thread)).toBe(threadEnrichmentKey(thread));
		expect(threadEnrichmentKey(thread)).toBe("thread:RT_1:C_1");
	});

	test("thread key rolls when the last comment id changes", () => {
		const before = threadEnrichmentKey(threadFixture({ lastCommentId: "C_1" }));
		const after = threadEnrichmentKey(threadFixture({ lastCommentId: "C_2" }));
		expect(before).not.toBe(after);
	});

	test("thread key uses 'none' when there is no last comment", () => {
		expect(threadEnrichmentKey(threadFixture({ lastCommentId: null }))).toBe("thread:RT_1:none");
	});

	test("thread key is null when the thread has no GraphQL id", () => {
		expect(threadEnrichmentKey(threadFixture({ id: null }))).toBeNull();
	});

	test("check key uses the run/job-unique detailsUrl as the primary discriminator", () => {
		expect(checkEnrichmentKey(checkFixture())).toBe("check:https://example.test/run/1:FAILURE");
	});

	test("same-named checks with different detailsUrl get different keys", () => {
		const onPrA = checkEnrichmentKey(checkFixture({ detailsUrl: "https://example.test/run/1" }));
		const onPrB = checkEnrichmentKey(checkFixture({ detailsUrl: "https://example.test/run/2" }));
		expect(onPrA).not.toBe(onPrB);
	});

	test("check key falls back to identity when detailsUrl is null", () => {
		expect(checkEnrichmentKey(checkFixture({ detailsUrl: null }))).toBe(
			"check:CI/typecheck:FAILURE",
		);
	});

	test("check key falls back to workflowName/name when detailsUrl and identity are null", () => {
		expect(checkEnrichmentKey(checkFixture({ detailsUrl: null, identity: null }))).toBe(
			"check:CI/typecheck:FAILURE",
		);
	});

	test("check key falls back to bare /name when detailsUrl, identity, and workflow are null", () => {
		expect(
			checkEnrichmentKey(checkFixture({ detailsUrl: null, identity: null, workflowName: null })),
		).toBe("check:/typecheck:FAILURE");
	});

	test("check key rolls when the conclusion changes", () => {
		const before = checkEnrichmentKey(checkFixture({ conclusion: "FAILURE" }));
		const after = checkEnrichmentKey(checkFixture({ conclusion: "TIMED_OUT" }));
		expect(before).not.toBe(after);
	});

	test("check key uses 'none' when the conclusion is null", () => {
		expect(checkEnrichmentKey(checkFixture({ conclusion: null }))).toBe(
			"check:https://example.test/run/1:none",
		);
	});
});

describe("enrichment store", () => {
	const ready = (summary: string): EnrichmentEntry => ({ state: "ready", summary });

	test("get/set round-trips an entry", () => {
		const store = createEnrichmentStore();
		expect(store.get("a")).toBeUndefined();
		store.set("a", ready("one"));
		expect(store.get("a")).toEqual({ state: "ready", summary: "one" });
	});

	test("set overwrites an existing key", () => {
		const store = createEnrichmentStore();
		store.set("a", { state: "pending" });
		store.set("a", ready("done"));
		expect(store.get("a")).toEqual({ state: "ready", summary: "done" });
	});

	test("evicts the least-recently-used entry when over capacity", () => {
		const store = createEnrichmentStore({ maxEntries: 2 });
		store.set("a", ready("a"));
		store.set("b", ready("b"));
		store.set("c", ready("c"));
		expect(store.get("a")).toBeUndefined();
		expect(store.get("b")).toEqual(ready("b"));
		expect(store.get("c")).toEqual(ready("c"));
	});

	test("eviction skips pending entries and drops the oldest non-pending instead", () => {
		const store = createEnrichmentStore({ maxEntries: 2 });
		store.set("a", { state: "pending" });
		store.set("b", ready("b"));
		// "a" is the oldest but pending, so "b" (oldest non-pending) is evicted; the
		// pending ownership marker survives.
		store.set("c", ready("c"));
		expect(store.get("a")).toEqual({ state: "pending" });
		expect(store.get("b")).toBeUndefined();
		expect(store.get("c")).toEqual(ready("c"));
	});

	test("eviction drops nothing when every over-capacity entry is pending", () => {
		const store = createEnrichmentStore({ maxEntries: 1 });
		store.set("a", { state: "pending" });
		store.set("b", { state: "pending" });
		expect(store.get("a")).toEqual({ state: "pending" });
		expect(store.get("b")).toEqual({ state: "pending" });
	});

	test("get refreshes recency so a touched entry survives eviction", () => {
		const store = createEnrichmentStore({ maxEntries: 2 });
		store.set("a", ready("a"));
		store.set("b", ready("b"));
		// Touch "a" so "b" becomes least-recently-used.
		expect(store.get("a")).toEqual(ready("a"));
		store.set("c", ready("c"));
		expect(store.get("b")).toBeUndefined();
		expect(store.get("a")).toEqual(ready("a"));
		expect(store.get("c")).toEqual(ready("c"));
	});

	test("snapshot is a defensive copy", () => {
		const store = createEnrichmentStore();
		store.set("a", ready("a"));
		const snap = store.snapshot();
		store.set("b", ready("b"));
		store.delete("a");
		expect(snap.has("a")).toBe(true);
		expect(snap.has("b")).toBe(false);
		expect(snap.size).toBe(1);
	});

	test("delete removes an entry", () => {
		const store = createEnrichmentStore();
		store.set("a", ready("a"));
		store.delete("a");
		expect(store.get("a")).toBeUndefined();
	});
});

describe("thread summary prompt", () => {
	test("single-comment happy path", () => {
		const prompt = buildThreadSummaryPrompt({
			prNumber: 12,
			thread: threadFixture({ comments: [commentFixture({ body: "please rename this" })] }),
		});
		expect(prompt.systemPrompt).toContain("summarize a code-review thread");
		const lines = prompt.userText.split("\n");
		expect(lines[0]).toBe("PR #12 — src/foo.ts:42");
		expect(lines[1]).toBe("alice: please rename this");
	});

	test("omits the line suffix when the thread is file-level", () => {
		const prompt = buildThreadSummaryPrompt({
			prNumber: 7,
			thread: threadFixture({ line: null }),
		});
		expect(prompt.userText.split("\n")[0]).toBe("PR #7 — src/foo.ts");
	});

	test("renders (unknown) for a null author", () => {
		const prompt = buildThreadSummaryPrompt({
			prNumber: 1,
			thread: threadFixture({ comments: [commentFixture({ author: null, body: "hi" })] }),
		});
		expect(prompt.userText).toContain("(unknown): hi");
	});

	test("truncates a comment body at the per-comment cap", () => {
		const body = "x".repeat(THREAD_COMMENT_BODY_MAX_CHARS + 500);
		const prompt = buildThreadSummaryPrompt({
			prNumber: 1,
			thread: threadFixture({ comments: [commentFixture({ author: "bob", body })] }),
		});
		const expected = `bob: ${"x".repeat(THREAD_COMMENT_BODY_MAX_CHARS)}…`;
		expect(prompt.userText).toContain(expected);
		expect(prompt.userText).not.toContain("x".repeat(THREAD_COMMENT_BODY_MAX_CHARS + 1));
	});

	test("total-cap keeps the first and most-recent comments with an omission marker", () => {
		const big = "y".repeat(THREAD_COMMENT_BODY_MAX_CHARS);
		const comments = Array.from({ length: 10 }, (_, index) =>
			commentFixture({ id: `C_${index}`, author: `u${index}`, body: big }),
		);
		const prompt = buildThreadSummaryPrompt({
			prNumber: 3,
			thread: threadFixture({ comments }),
		});
		expect(prompt.userText.length).toBeLessThanOrEqual(THREAD_USER_TEXT_MAX_CHARS);
		expect(prompt.userText).toContain("u0:");
		expect(prompt.userText).toContain("(… earlier comments omitted)");
		// The most-recent comment survives; an early middle comment is dropped.
		expect(prompt.userText).toContain("u9:");
		expect(prompt.userText).not.toContain("u1:");
		// First comment precedes the omission marker precedes the recent comment.
		const firstIndex = prompt.userText.indexOf("u0:");
		const markerIndex = prompt.userText.indexOf("(… earlier comments omitted)");
		const recentIndex = prompt.userText.indexOf("u9:");
		expect(firstIndex).toBeLessThan(markerIndex);
		expect(markerIndex).toBeLessThan(recentIndex);
	});

	test("appends the more-comments note using the honest difference", () => {
		const prompt = buildThreadSummaryPrompt({
			prNumber: 4,
			thread: threadFixture({ comments: [commentFixture()], totalComments: 6 }),
		});
		expect(prompt.userText).toContain("(thread has 5 more comments than shown)");
	});

	test("omits the more-comments note when nothing is hidden", () => {
		const prompt = buildThreadSummaryPrompt({
			prNumber: 4,
			thread: threadFixture({ comments: [commentFixture()], totalComments: 1 }),
		});
		expect(prompt.userText).not.toContain("more comments than shown");
	});
});

describe("check summary prompt", () => {
	test("includes workflow and conclusion header lines when present", () => {
		const prompt = buildCheckSummaryPrompt({
			entry: checkFixture(),
			logTail: "boom: undefined is not a function",
		});
		expect(prompt.systemPrompt).toContain("diagnose a failed GitHub Actions check");
		expect(prompt.userText).toContain("Check: typecheck");
		expect(prompt.userText).toContain("Workflow: CI");
		expect(prompt.userText).toContain("Conclusion: FAILURE");
		expect(prompt.userText).toContain("boom: undefined is not a function");
	});

	test("omits workflow and conclusion lines when they are null", () => {
		const prompt = buildCheckSummaryPrompt({
			entry: checkFixture({ workflowName: null, conclusion: null }),
			logTail: "err",
		});
		expect(prompt.userText).not.toContain("Workflow:");
		expect(prompt.userText).not.toContain("Conclusion:");
		expect(prompt.userText).toContain("Check: typecheck");
	});

	test("keeps the END of the log and adds the truncation prefix", () => {
		const head = "H".repeat(1000);
		const tail = "TAIL-MARKER-END";
		const logTail = `${head}${"m".repeat(CHECK_LOG_TAIL_MAX_CHARS)}${tail}`;
		const prompt = buildCheckSummaryPrompt({ entry: checkFixture(), logTail });
		expect(prompt.userText).toContain(
			`(log truncated to final ${CHECK_LOG_TAIL_MAX_CHARS} characters)`,
		);
		expect(prompt.userText).toContain(tail);
		expect(prompt.userText).not.toContain(head);
	});

	test("does not truncate a short log", () => {
		const prompt = buildCheckSummaryPrompt({ entry: checkFixture(), logTail: "short log" });
		expect(prompt.userText).not.toContain("log truncated");
		expect(prompt.userText.endsWith("short log")).toBe(true);
	});
});
