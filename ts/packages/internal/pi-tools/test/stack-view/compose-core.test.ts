import { describe, expect, test } from "vitest";

import { extractDraft, stripDraftBlock } from "../../src/stack-view/compose-draft.ts";
import {
	buildComposeSystemPrompt,
	COMPOSE_COMMENT_BODY_MAX_CHARS,
	COMPOSE_MAX_THREAD_COMMENTS,
} from "../../src/stack-view/compose-prompt.ts";
import {
	appendNotice,
	appendUser,
	applyComposeEvent,
	type ComposeSessionEvent,
	type ComposeTranscriptState,
	EMPTY_COMPOSE_TRANSCRIPT,
	lastAssistantText,
	replaceLastAssistantText,
	replaceLastNotice,
	setStreaming,
} from "../../src/stack-view/compose-transcript.ts";
import type { EnrichmentEntry } from "../../src/stack-view/enrichment-store.ts";
import type {
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadComment,
	StackViewThreadDetail,
} from "../../src/stack-view/types.ts";
import { checkEnrichmentKey, threadEnrichmentKey } from "../../src/stack-view/enrichment-keys.ts";

describe("extractDraft", () => {
	test("happy path returns the draft body", () => {
		const reply = [
			"Here is my proposal.",
			"```draft",
			"Fix branch A first.",
			"Then branch B.",
			"```",
		].join("\n");
		expect(extractDraft(reply)).toBe("Fix branch A first.\nThen branch B.");
	});

	test("no block returns null", () => {
		expect(extractDraft("Just some prose with no fenced draft.")).toBeNull();
	});

	test("unterminated fence takes content to EOF", () => {
		const reply = ["intro", "```draft", "line one", "line two"].join("\n");
		expect(extractDraft(reply)).toBe("line one\nline two");
	});

	test("multiple draft blocks: last one wins", () => {
		const reply = ["```draft", "old draft", "```", "revised:", "```draft", "new draft", "```"].join(
			"\n",
		);
		expect(extractDraft(reply)).toBe("new draft");
	});

	test("stray closing fences inside the draft: last closer wins", () => {
		const reply = ["```draft", "part one", "```", "part two", "```"].join("\n");
		expect(extractDraft(reply)).toBe("part one\n```\npart two");
	});

	test("prose mentioning ```draft inline is not treated as an opener", () => {
		const inlineMention = "the agent emits a ```draft block at the end";
		const leadingText = "  ```draft with leading indentation";
		const reply = [inlineMention, leadingText, "no real block here"].join("\n");
		expect(extractDraft(reply)).toBeNull();
	});

	test("empty block returns null", () => {
		expect(extractDraft(["```draft", "```"].join("\n"))).toBeNull();
	});

	test("whitespace-only block returns null", () => {
		expect(extractDraft(["```draft", "   ", "\t", "```"].join("\n"))).toBeNull();
	});

	test("trailing whitespace is trimmed across the whole draft", () => {
		const reply = ["```draft", "content", "", "   ", "```"].join("\n");
		expect(extractDraft(reply)).toBe("content");
	});

	test("leading indentation inside the draft is preserved", () => {
		const reply = ["```draft", "    indented code", "```"].join("\n");
		expect(extractDraft(reply)).toBe("    indented code");
	});

	test("CRLF input is normalized on fence and content lines", () => {
		const reply = ["intro", "```draft", "line one", "line two", "```"].join("\r\n");
		expect(extractDraft(reply)).toBe("line one\nline two");
	});
});

describe("stripDraftBlock", () => {
	test("replaces the block with a placeholder carrying the line count", () => {
		const reply = ["Sure.", "```draft", "line one", "line two", "```"].join("\n");
		expect(stripDraftBlock(reply)).toBe("Sure.\n[draft updated — 2 lines]");
	});

	test("unterminated block is stripped to EOF", () => {
		const reply = ["Sure.", "```draft", "only line"].join("\n");
		expect(stripDraftBlock(reply)).toBe("Sure.\n[draft updated — 1 lines]");
	});

	test("no block returns text unchanged", () => {
		const reply = "plain prose, no draft";
		expect(stripDraftBlock(reply)).toBe(reply);
	});

	test("empty block uses the empty placeholder", () => {
		const reply = ["Here.", "```draft", "```"].join("\n");
		expect(stripDraftBlock(reply)).toBe("Here.\n[draft block empty]");
	});

	test("prose after the block is preserved", () => {
		const reply = ["```draft", "d", "```", "trailing prose"].join("\n");
		expect(stripDraftBlock(reply)).toBe("[draft updated — 1 lines]\ntrailing prose");
	});
});

describe("compose transcript reducer", () => {
	function delta(text: string): ComposeSessionEvent {
		return { type: "assistant-delta", text };
	}

	test("delta opens an assistant entry then appends to it", () => {
		let state = EMPTY_COMPOSE_TRANSCRIPT;
		state = applyComposeEvent(state, delta("Hello"));
		state = applyComposeEvent(state, delta(" world"));
		expect(state.entries).toEqual([{ kind: "assistant", text: "Hello world" }]);
	});

	test("interleaved user, notice, and delta entries", () => {
		let state = EMPTY_COMPOSE_TRANSCRIPT;
		state = appendUser(state, "fix the stack");
		state = applyComposeEvent(state, delta("on it"));
		state = appendNotice(state, "thinking");
		state = applyComposeEvent(state, delta("more"));
		expect(state.entries).toEqual([
			{ kind: "user", text: "fix the stack" },
			{ kind: "assistant", text: "on it" },
			{ kind: "notice", text: "thinking" },
			{ kind: "assistant", text: "more" },
		]);
	});

	test("assistant-end and turn-end are no-ops on entries", () => {
		let state = applyComposeEvent(EMPTY_COMPOSE_TRANSCRIPT, delta("hi"));
		state = applyComposeEvent(state, { type: "assistant-end" });
		state = applyComposeEvent(state, { type: "turn-end" });
		expect(state.entries).toEqual([{ kind: "assistant", text: "hi" }]);
	});

	test("retry becomes a notice", () => {
		const state = applyComposeEvent(EMPTY_COMPOSE_TRANSCRIPT, {
			type: "retry",
			attempt: 2,
			maxAttempts: 5,
			message: "rate limited",
		});
		expect(state.entries).toEqual([{ kind: "notice", text: "retrying (2/5): rate limited" }]);
	});

	test("replaceLastNotice replaces when last is a notice", () => {
		const state = replaceLastNotice(appendNotice(EMPTY_COMPOSE_TRANSCRIPT, "old"), "new");
		expect(state.entries).toEqual([{ kind: "notice", text: "new" }]);
	});

	test("replaceLastNotice appends when last is not a notice", () => {
		const state = replaceLastNotice(appendUser(EMPTY_COMPOSE_TRANSCRIPT, "hi"), "note");
		expect(state.entries).toEqual([
			{ kind: "user", text: "hi" },
			{ kind: "notice", text: "note" },
		]);
	});

	test("replaceLastAssistantText replaces the last assistant entry only", () => {
		let state = applyComposeEvent(EMPTY_COMPOSE_TRANSCRIPT, delta("raw reply"));
		state = appendNotice(state, "after");
		state = replaceLastAssistantText(state, "stripped reply");
		expect(state.entries).toEqual([
			{ kind: "assistant", text: "stripped reply" },
			{ kind: "notice", text: "after" },
		]);
	});

	test("replaceLastAssistantText is a no-op when there is no assistant entry", () => {
		const before = appendUser(EMPTY_COMPOSE_TRANSCRIPT, "hi");
		expect(replaceLastAssistantText(before, "x")).toEqual(before);
	});

	test("lastAssistantText returns null when no assistant entry exists", () => {
		expect(lastAssistantText(appendUser(EMPTY_COMPOSE_TRANSCRIPT, "hi"))).toBeNull();
	});

	test("lastAssistantText returns the last assistant entry's text", () => {
		const state = applyComposeEvent(EMPTY_COMPOSE_TRANSCRIPT, delta("draft text"));
		expect(lastAssistantText(state)).toBe("draft text");
	});

	test("setStreaming toggles the flag immutably", () => {
		const state = setStreaming(EMPTY_COMPOSE_TRANSCRIPT, true);
		expect(state.isStreaming).toBe(true);
		expect(EMPTY_COMPOSE_TRANSCRIPT.isStreaming).toBe(false);
	});

	test("reducers never mutate the input state", () => {
		const before: ComposeTranscriptState = appendUser(EMPTY_COMPOSE_TRANSCRIPT, "seed");
		const snapshot = structuredClone(before);
		applyComposeEvent(before, delta("x"));
		appendNotice(before, "y");
		replaceLastNotice(before, "z");
		replaceLastAssistantText(before, "w");
		setStreaming(before, true);
		expect(before).toEqual(snapshot);
	});
});

function commentFixture(overrides?: Partial<StackViewThreadComment>): StackViewThreadComment {
	return {
		id: "C_1",
		author: "alice",
		body: "please rename this symbol",
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

function prFixture(overrides?: Partial<StackViewPr>): StackViewPr {
	return {
		branch: "feat-a",
		parentBranch: "main",
		number: 100,
		title: "Feature A",
		url: "https://github.test/pr/100",
		graphiteUrl: "https://app.graphite.dev/pr/100",
		isDraft: false,
		body: "body",
		threads: { resolved: 0, total: 0 },
		checks: { passing: 0, failing: 0, pending: 0, total: 0 },
		checkEntries: [],
		unresolvedThreads: [],
		status: "ready",
		objectiveSlugs: [],
		...overrides,
	};
}

function modelFixture(prs: StackViewPr[]): StackViewModel {
	return {
		trunk: "main",
		currentBranch: "feat-b",
		prs,
		owner: "acme",
		repo: "widgets",
		objectivesBySlug: new Map(),
	};
}

describe("buildComposeSystemPrompt", () => {
	test("renders PRs bottom-up: first section is the nearest-trunk PR", () => {
		// model.prs is top-first: top is feat-b (#200), bottom is feat-a (#100).
		const top = prFixture({
			branch: "feat-b",
			number: 200,
			title: "Feature B",
			parentBranch: "feat-a",
		});
		const bottom = prFixture({
			branch: "feat-a",
			number: 100,
			title: "Feature A",
			parentBranch: "main",
		});
		const prompt = buildComposeSystemPrompt({
			model: modelFixture([top, bottom]),
			enrichment: new Map(),
		});
		const firstIndex = prompt.indexOf("## PR 1/2: #100 Feature A");
		const secondIndex = prompt.indexOf("## PR 2/2: #200 Feature B");
		expect(firstIndex).toBeGreaterThan(-1);
		expect(secondIndex).toBeGreaterThan(firstIndex);
	});

	test("context header names owner, repo, trunk, and current branch", () => {
		const prompt = buildComposeSystemPrompt({
			model: modelFixture([prFixture()]),
			enrichment: new Map(),
		});
		expect(prompt).toContain("Stack: acme/widgets (trunk: main, current branch: feat-b)");
	});

	test("thread ids and comments appear; ready thread summary is rendered", () => {
		const thread = threadFixture({ id: "RT_9", path: "src/bar.ts", line: 7, author: "bob" });
		const pr = prFixture({
			threads: { resolved: 0, total: 1 },
			unresolvedThreads: [thread],
		});
		const enrichment = new Map<string, EnrichmentEntry>([
			[threadEnrichmentKey(thread) ?? "", { state: "ready", summary: "rename the export" }],
		]);
		const prompt = buildComposeSystemPrompt({ model: modelFixture([pr]), enrichment });
		expect(prompt).toContain("- thread RT_9 · src/bar.ts:7 · bob");
		expect(prompt).toContain("  asks: rename the export");
		expect(prompt).toContain("  alice: please rename this symbol");
	});

	test("ready check diagnosis is rendered; absent one falls back to no-diagnosis marker", () => {
		const diagnosed = checkFixture({ name: "typecheck", detailsUrl: "https://example.test/run/1" });
		const undiagnosed = checkFixture({
			name: "lint",
			workflowName: "CI",
			detailsUrl: "https://example.test/run/2",
			identity: "CI/lint",
		});
		const pr = prFixture({
			checks: { passing: 0, failing: 2, pending: 0, total: 2 },
			checkEntries: [diagnosed, undiagnosed],
			status: "checks-failing",
		});
		const enrichment = new Map<string, EnrichmentEntry>([
			[checkEnrichmentKey(diagnosed), { state: "ready", summary: "tsc: type error in foo.ts" }],
		]);
		const prompt = buildComposeSystemPrompt({ model: modelFixture([pr]), enrichment });
		expect(prompt).toContain("- typecheck (CI)");
		expect(prompt).toContain("  tsc: type error in foo.ts");
		expect(prompt).toContain("- lint (CI)");
		expect(prompt).toContain("  (no diagnosis available)");
	});

	test("non-ready enrichment states fall back to the no-diagnosis marker", () => {
		const check = checkFixture();
		const pr = prFixture({
			checks: { passing: 0, failing: 1, pending: 0, total: 1 },
			checkEntries: [check],
			status: "checks-failing",
		});
		const enrichment = new Map<string, EnrichmentEntry>([
			[checkEnrichmentKey(check), { state: "pending" }],
		]);
		const prompt = buildComposeSystemPrompt({ model: modelFixture([pr]), enrichment });
		expect(prompt).toContain("  (no diagnosis available)");
	});

	test("comment list caps at the max and notes the remainder", () => {
		const comments = Array.from({ length: 8 }, (_, index) =>
			commentFixture({ id: `C_${index}`, author: `user${index}`, body: `comment ${index}` }),
		);
		const thread = threadFixture({ comments, totalComments: comments.length });
		const pr = prFixture({ threads: { resolved: 0, total: 1 }, unresolvedThreads: [thread] });
		const prompt = buildComposeSystemPrompt({ model: modelFixture([pr]), enrichment: new Map() });
		expect(prompt).toContain("  user0: comment 0");
		expect(prompt).toContain(
			`  user${COMPOSE_MAX_THREAD_COMMENTS - 1}: comment ${COMPOSE_MAX_THREAD_COMMENTS - 1}`,
		);
		expect(prompt).not.toContain(
			`user${COMPOSE_MAX_THREAD_COMMENTS}: comment ${COMPOSE_MAX_THREAD_COMMENTS}`,
		);
		expect(prompt).toContain(`(+${comments.length - COMPOSE_MAX_THREAD_COMMENTS} more comments)`);
	});

	test("over-long comment bodies are truncated with an ellipsis", () => {
		const body = "x".repeat(COMPOSE_COMMENT_BODY_MAX_CHARS + 50);
		const thread = threadFixture({ comments: [commentFixture({ body })] });
		const pr = prFixture({ threads: { resolved: 0, total: 1 }, unresolvedThreads: [thread] });
		const prompt = buildComposeSystemPrompt({ model: modelFixture([pr]), enrichment: new Map() });
		expect(prompt).toContain(`${"x".repeat(COMPOSE_COMMENT_BODY_MAX_CHARS)}…`);
		expect(prompt).not.toContain("x".repeat(COMPOSE_COMMENT_BODY_MAX_CHARS + 1));
	});

	test("pending checks and objectives are listed", () => {
		const pending = checkFixture({ name: "build", bucket: "pending", conclusion: null });
		const pr = prFixture({
			checks: { passing: 0, failing: 0, pending: 1, total: 1 },
			checkEntries: [pending],
			objectiveSlugs: ["compose-subsystem", "stack-view"],
		});
		const prompt = buildComposeSystemPrompt({ model: modelFixture([pr]), enrichment: new Map() });
		expect(prompt).toContain("PENDING CHECKS (1):");
		expect(prompt).toContain("- build (CI)");
		expect(prompt).toContain("objectives: compose-subsystem, stack-view");
	});

	test("a PR-less row renders the no-PR heading", () => {
		const pr = prFixture({ number: null, branch: "wip-branch", status: "no-pr" });
		const prompt = buildComposeSystemPrompt({ model: modelFixture([pr]), enrichment: new Map() });
		expect(prompt).toContain("## PR 1/1: (no PR) wip-branch");
	});

	test("close-review-threads command wording is present verbatim", () => {
		const prompt = buildComposeSystemPrompt({
			model: modelFixture([prFixture()]),
			enrichment: new Map(),
		});
		expect(prompt).toContain(
			'ns address exec close-review-threads --thread-ids-json \'{"threadIds":["<THREAD_ID>"]}\' --format json',
		);
		expect(prompt).toContain("never use raw `gh api graphql`");
	});

	test("draft protocol text is present", () => {
		const prompt = buildComposeSystemPrompt({
			model: modelFixture([prFixture()]),
			enrichment: new Map(),
		});
		expect(prompt).toContain("a line containing exactly ```draft");
		expect(prompt).toContain("Propose an initial draft in your first reply.");
	});
});
