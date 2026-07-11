import { describe, expect, test } from "vitest";

import {
	parseSideQuestSentinel,
	resolveFreeformSideQuest,
} from "../../../src/grill/sidequest/sentinel.ts";
import {
	GRILL_SIDEQUEST_CLOSURE_ENTRY_TYPE,
	scanGrillBranch,
} from "../../../src/grill/sidequest/state.ts";
import type { SideQuestStartedInfo } from "../../../src/grill/sidequest/protocol.ts";

const KICKOFF_TEXT = "<structured-grill-question-ui-contract>\nplan under grill";

function userEntry(id: string, text: string): unknown {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-07-11T00:00:00Z",
		message: { role: "user", content: text },
	};
}

function askEntry(
	id: string,
	toolCallId: string,
	question: string,
	estimatedRemaining?: unknown,
): unknown {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-07-11T00:00:00Z",
		message: {
			role: "assistant",
			content: [
				{ type: "text", text: "asking" },
				{
					type: "toolCall",
					id: toolCallId,
					name: "grill_ask",
					arguments: {
						question,
						...(estimatedRemaining === undefined ? {} : { estimatedRemaining }),
					},
				},
			],
		},
	};
}

function grillResultEntry(id: string, details: unknown, toolCallId?: string): unknown {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-07-11T00:00:00Z",
		message: {
			role: "toolResult",
			toolName: "grill_ask",
			...(toolCallId === undefined ? {} : { toolCallId }),
			details,
		},
	};
}

function closureEntry(id: string, returned: string): unknown {
	return {
		type: "custom",
		id,
		parentId: null,
		timestamp: "2026-07-11T00:00:00Z",
		customType: GRILL_SIDEQUEST_CLOSURE_ENTRY_TYPE,
		data: { returned },
	};
}

function grillingBranch(): unknown[] {
	return [
		userEntry("kickoff", KICKOFF_TEXT),
		askEntry("ask-1", "call-1", "First question?"),
		grillResultEntry("res-1", { action: "answer", kind: "choice", question: "First question?" }),
		askEntry("ask-2", "call-2", "Second question?", {
			kind: "range",
			min: 2,
			max: 4,
			basis: "two branches",
		}),
	];
}

describe("scanGrillBranch", () => {
	test("no kickoff marker means no grill, even with grill_ask results present", () => {
		const state = scanGrillBranch([
			askEntry("ask-1", "call-1", "Q?"),
			grillResultEntry("res-1", { action: "answer", question: "Q?" }),
		]);

		expect(state).toEqual({ grill: "none" });
	});

	test("active grill reports answered count and the latest ask with estimate", () => {
		const state = scanGrillBranch(grillingBranch());

		expect(state).toEqual({
			grill: "active",
			answeredCount: 1,
			latestAsk: {
				question: "Second question?",
				toolCallId: "call-2",
				estimatedRemaining: { kind: "range", min: 2, max: 4, basis: "two branches" },
			},
		});
	});

	test("end-grill after kickoff reports the grill as ended", () => {
		const state = scanGrillBranch([
			...grillingBranch(),
			grillResultEntry("res-2", { action: "end-grill", question: "Second question?" }),
		]);

		expect(state).toEqual({ grill: "ended", answeredCount: 1 });
	});

	test("scanning is scoped to the latest kickoff marker", () => {
		const state = scanGrillBranch([
			userEntry("kickoff-1", KICKOFF_TEXT),
			grillResultEntry("stale-answer", { action: "answer", question: "Old?" }),
			grillResultEntry(
				"stale-quest",
				{ action: "side-quest", question: "Old?", topic: "stale topic" },
				"call-old",
			),
			userEntry("kickoff-2", KICKOFF_TEXT),
			askEntry("ask-1", "call-1", "Fresh question?"),
		]);

		expect(state).toEqual({
			grill: "active",
			answeredCount: 0,
			latestAsk: { question: "Fresh question?", toolCallId: "call-1" },
		});
	});

	test("a stamped side-quest tool result becomes the active quest", () => {
		const state = scanGrillBranch([
			...grillingBranch(),
			grillResultEntry(
				"mark",
				{ action: "side-quest", question: "Second question?", topic: "what does X depend on" },
				"call-2",
			),
		]);

		expect(state).toMatchObject({
			grill: "active",
			answeredCount: 1,
			activeQuest: {
				markEntryId: "mark",
				toolCallId: "call-2",
				topic: "what does X depend on",
				pendingQuestion: "Second question?",
			},
		});
	});

	test("a closure entry with the quest's tool call id closes the quest", () => {
		const state = scanGrillBranch([
			...grillingBranch(),
			grillResultEntry(
				"mark",
				{ action: "side-quest", question: "Second question?", topic: "topic" },
				"call-2",
			),
			closureEntry("closure", "call-2"),
		]);

		expect(state).toMatchObject({ grill: "active", answeredCount: 1 });
		expect(state).not.toHaveProperty("activeQuest");
	});

	test("a stamp without a tool call id falls back to the mark entry id as closure key", () => {
		const openState = scanGrillBranch([
			...grillingBranch(),
			grillResultEntry("mark", { action: "side-quest", question: "Second question?", topic: "t" }),
		]);
		expect(openState).toMatchObject({ activeQuest: { markEntryId: "mark", topic: "t" } });

		const closedState = scanGrillBranch([
			...grillingBranch(),
			grillResultEntry("mark", { action: "side-quest", question: "Second question?", topic: "t" }),
			closureEntry("closure", "mark"),
		]);
		expect(closedState).not.toHaveProperty("activeQuest");
	});

	test("a command kickoff marker message becomes the active quest with the latest ask pending", () => {
		const state = scanGrillBranch([
			...grillingBranch(),
			userEntry(
				"command-mark",
				"<grill-sidequest-start>\nexplore the cache layer\n</grill-sidequest-start>\n\nSide quest started.",
			),
		]);

		expect(state).toMatchObject({
			activeQuest: {
				markEntryId: "command-mark",
				topic: "explore the cache layer",
				pendingQuestion: "Second question?",
			},
		});
	});

	test("self-healing: a branch parked before the mark has no quest", () => {
		const branch = [
			...grillingBranch(),
			grillResultEntry(
				"mark",
				{ action: "side-quest", question: "Second question?", topic: "topic" },
				"call-2",
			),
		];

		const state = scanGrillBranch(branch.slice(0, branch.length - 1));

		expect(state).toMatchObject({ grill: "active", answeredCount: 1 });
		expect(state).not.toHaveProperty("activeQuest");
	});

	test("side-quest results are not counted as answers", () => {
		const state = scanGrillBranch([
			...grillingBranch(),
			grillResultEntry(
				"mark",
				{ action: "side-quest", question: "Second question?", topic: "topic" },
				"call-2",
			),
			closureEntry("closure", "call-2"),
			grillResultEntry("refused", {
				action: "side-quest-refused",
				question: "Second question?",
				topic: "another",
			}),
		]);

		expect(state).toMatchObject({ grill: "active", answeredCount: 1 });
	});
});

describe("parseSideQuestSentinel", () => {
	test("parses sq and sidequest prefixes case-insensitively", () => {
		expect(parseSideQuestSentinel("sq: what does X depend on?")).toBe("what does X depend on?");
		expect(parseSideQuestSentinel("SQ:tight topic")).toBe("tight topic");
		expect(parseSideQuestSentinel("Sidequest : explore the cache")).toBe("explore the cache");
		expect(parseSideQuestSentinel("  sq: padded  ")).toBe("padded");
	});

	test("keeps multi-line topics intact", () => {
		expect(parseSideQuestSentinel("sq: first line\nsecond line")).toBe("first line\nsecond line");
	});

	test("rejects non-sentinel answers and empty topics", () => {
		expect(parseSideQuestSentinel("I think sq is a fine abbreviation")).toBeUndefined();
		expect(parseSideQuestSentinel("seq: not a sentinel")).toBeUndefined();
		expect(parseSideQuestSentinel("sq:")).toBeUndefined();
		expect(parseSideQuestSentinel("sq:   ")).toBeUndefined();
		expect(parseSideQuestSentinel("use sq: inline")).toBeUndefined();
	});
});

describe("resolveFreeformSideQuest", () => {
	test("returns undefined for non-sentinel answers", () => {
		const result = resolveFreeformSideQuest({
			answer: "A normal freeform answer.",
			question: "Second question?",
			ctx: { hasUI: true, ui: {} },
		});

		expect(result).toBeUndefined();
	});

	test("starts a side quest and reports the tool call id to the callback", () => {
		const started: SideQuestStartedInfo[] = [];
		const result = resolveFreeformSideQuest({
			answer: "sq: what does X depend on?",
			question: "Second question?",
			ctx: {
				hasUI: true,
				ui: {},
				sessionManager: { getBranch: () => grillingBranch() },
			},
			toolCallId: "call-2",
			onSideQuestStarted: (info) => started.push(info),
		});

		expect(result?.details).toEqual({
			action: "side-quest",
			question: "Second question?",
			topic: "what does X depend on?",
		});
		expect(result?.content[0]?.text).toContain("Side quest started: `what does X depend on?`");
		expect(result?.content[0]?.text).toContain("NOT an answer");
		expect(result?.content[0]?.text).toContain("Do not call grill_ask");
		expect(started).toEqual([
			{ toolCallId: "call-2", topic: "what does X depend on?", question: "Second question?" },
		]);
	});

	test("starts without a callback when no tool call id is available", () => {
		const result = resolveFreeformSideQuest({
			answer: "sidequest: quick tangent",
			question: "Second question?",
			ctx: { hasUI: true, ui: {} },
		});

		expect(result?.details).toMatchObject({ action: "side-quest", topic: "quick tangent" });
	});

	test("refuses a second quest while one is active and does not fire the callback", () => {
		const started: SideQuestStartedInfo[] = [];
		const result = resolveFreeformSideQuest({
			answer: "sq: another tangent",
			question: "Second question?",
			ctx: {
				hasUI: true,
				ui: {},
				sessionManager: {
					getBranch: () => [
						...grillingBranch(),
						grillResultEntry(
							"mark",
							{ action: "side-quest", question: "Second question?", topic: "first tangent" },
							"call-2",
						),
					],
				},
			},
			toolCallId: "call-3",
			onSideQuestStarted: (info) => started.push(info),
		});

		expect(result?.details).toEqual({
			action: "side-quest-refused",
			question: "Second question?",
			topic: "another tangent",
		});
		expect(result?.content[0]?.text).toContain("already active (`first tangent`)");
		expect(result?.content[0]?.text).toContain("NOT an answer");
		expect(started).toEqual([]);
	});
});
