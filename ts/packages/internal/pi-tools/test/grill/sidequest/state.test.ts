import { describe, expect, test } from "vitest";

import type { GrillAskDetails } from "../../../src/grill/result.ts";
import type {
	GrillSidequestCapability,
	GrillSidequestEvent,
	PendingGrillAsk,
} from "../../../src/grill/sidequest/protocol.ts";
import {
	parseSideQuestSentinel,
	resolveFreeformSideQuest,
} from "../../../src/grill/sidequest/sentinel.ts";
import {
	GRILL_SIDEQUEST_EVENT_ENTRY_TYPE,
	scanGrillBranch,
} from "../../../src/grill/sidequest/state.ts";

const KICKOFF_TEXT = "<structured-grill-question-ui-contract>\nplan under grill";

function userEntry(id: string, text: string): unknown {
	return { type: "message", id, parentId: null, message: { role: "user", content: text } };
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
		message: {
			role: "assistant",
			content: [
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

function grillResultEntry(id: string, details: GrillAskDetails, toolCallId?: string): unknown {
	return {
		type: "message",
		id,
		parentId: null,
		message: {
			role: "toolResult",
			toolName: "grill_ask",
			...(toolCallId === undefined ? {} : { toolCallId }),
			details,
		},
	};
}

function sideQuestEventEntry(id: string, event: unknown): unknown {
	return {
		type: "custom",
		id,
		parentId: null,
		customType: GRILL_SIDEQUEST_EVENT_ENTRY_TYPE,
		data: event,
	};
}

function startedEvent(
	questId: string,
	topic: string,
	pendingAsk?: PendingGrillAsk,
): GrillSidequestEvent {
	return {
		version: 1,
		event: "started",
		questId,
		topic,
		...(pendingAsk === undefined ? {} : { pendingAsk }),
	};
}

function closedEvent(questId: string): GrillSidequestEvent {
	return { version: 1, event: "closed", questId };
}

function activeBranch(): unknown[] {
	return [
		userEntry("kickoff", KICKOFF_TEXT),
		askEntry("ask-1", "call-1", "First question?"),
		grillResultEntry(
			"res-1",
			{
				action: "answer",
				kind: "choice",
				question: "First question?",
				value: "yes",
				label: "Yes",
				recommended: false,
			},
			"call-1",
		),
		askEntry("ask-2", "call-2", "Second question?", {
			kind: "range",
			min: 2,
			max: 4,
			basis: "two branches",
		}),
	];
}

function expectNoPending(state: ReturnType<typeof scanGrillBranch>): void {
	expect(state).not.toHaveProperty("pendingAsk");
	if (state.grill === "active" && state.activeQuest !== undefined) {
		expect(state.activeQuest).not.toHaveProperty("pendingAsk");
	}
}

describe("scanGrillBranch", () => {
	test("requires a grill kickoff and reports the current pending ask", () => {
		expect(scanGrillBranch([askEntry("ask", "call", "Q?")])).toEqual({ grill: "none" });
		expect(scanGrillBranch(activeBranch())).toEqual({
			grill: "active",
			answeredCount: 1,
			pendingAsk: {
				question: "Second question?",
				toolCallId: "call-2",
				estimatedRemaining: { kind: "range", min: 2, max: 4, basis: "two branches" },
			},
		});
	});

	test.each([
		{
			name: "answer",
			details: {
				action: "answer",
				kind: "freeform",
				question: "Second question?",
				answer: "Yes",
			} satisfies GrillAskDetails,
			answeredCount: 2,
			preserves: false,
		},
		{
			name: "status-request",
			details: {
				action: "status-request",
				question: "Second question?",
				progressSource: "unavailable",
			} satisfies GrillAskDetails,
			answeredCount: 1,
			preserves: true,
		},
		{
			name: "side-quest",
			details: {
				action: "side-quest",
				question: "Second question?",
				topic: "topic",
			} satisfies GrillAskDetails,
			answeredCount: 1,
			preserves: true,
		},
		{
			name: "side-quest-refused",
			details: {
				action: "side-quest-refused",
				question: "Second question?",
				topic: "topic",
			} satisfies GrillAskDetails,
			answeredCount: 1,
			preserves: true,
		},
		{
			name: "cancelled",
			details: { action: "cancelled", question: "Second question?" } satisfies GrillAskDetails,
			answeredCount: 1,
			preserves: false,
		},
		{
			name: "ui-unavailable",
			details: { action: "ui-unavailable", question: "Second question?" } satisfies GrillAskDetails,
			answeredCount: 1,
			preserves: false,
		},
		{
			name: "invalid-tool-input",
			details: { action: "invalid-tool-input", errors: ["bad"] } satisfies GrillAskDetails,
			answeredCount: 1,
			preserves: false,
		},
	])("$name applies its pending-ask transition", ({ details, answeredCount, preserves }) => {
		const state = scanGrillBranch([
			...activeBranch(),
			grillResultEntry("result", details, "call-2"),
		]);
		expect(state).toMatchObject({ grill: "active", answeredCount });
		if (preserves) expect(state).toHaveProperty("pendingAsk.toolCallId", "call-2");
		else expectNoPending(state);
	});

	test("end-grill clears pending state and ends the grill", () => {
		expect(
			scanGrillBranch([
				...activeBranch(),
				grillResultEntry("end", { action: "end-grill", question: "Second question?" }, "call-2"),
			]),
		).toEqual({ grill: "ended", answeredCount: 1 });
	});

	test("correlates results by toolCallId and treats an id-less result as the normal fallback", () => {
		const mismatch = scanGrillBranch([
			...activeBranch(),
			grillResultEntry("other", { action: "cancelled", question: "Other?" }, "call-other"),
		]);
		expect(mismatch).toHaveProperty("pendingAsk.toolCallId", "call-2");

		const idless = scanGrillBranch([
			...activeBranch(),
			grillResultEntry("idless", { action: "cancelled", question: "Second question?" }),
		]);
		expectNoPending(idless);
	});

	test("canonical start and close events own quest lifecycle and preserve their supplied snapshot", () => {
		const pendingAsk = { question: "Second question?", toolCallId: "call-2" };
		const open = scanGrillBranch([
			...activeBranch(),
			sideQuestEventEntry("mark", startedEvent("quest-1", "cache layout", pendingAsk)),
		]);
		expect(open).toMatchObject({
			grill: "active",
			answeredCount: 1,
			activeQuest: {
				questId: "quest-1",
				markEntryId: "mark",
				topic: "cache layout",
				pendingAsk,
			},
		});

		const closed = scanGrillBranch([
			...activeBranch(),
			sideQuestEventEntry("mark", startedEvent("quest-1", "cache layout", pendingAsk)),
			sideQuestEventEntry("close", closedEvent("quest-1")),
		]);
		expect(closed).not.toHaveProperty("activeQuest");
	});

	test("self-heals when tree navigation places the branch before the canonical start", () => {
		const branch = [
			...activeBranch(),
			sideQuestEventEntry("mark", startedEvent("quest-1", "cache layout")),
		];

		expect(scanGrillBranch(branch)).toHaveProperty("activeQuest.questId", "quest-1");
		expect(scanGrillBranch(branch.slice(0, -1))).not.toHaveProperty("activeQuest");
	});

	test.each(["menu", "sentinel", "slash-command"])(
		"canonical starts are origin-neutral for %s intent",
		() => {
			const state = scanGrillBranch([
				...activeBranch(),
				sideQuestEventEntry(
					"canonical-mark",
					startedEvent("quest-command", "command-like topic", {
						question: "Second question?",
						toolCallId: "call-2",
					}),
				),
			]);
			expect(state).toHaveProperty("activeQuest", {
				questId: "quest-command",
				markEntryId: "canonical-mark",
				topic: "command-like topic",
				pendingAsk: { question: "Second question?", toolCallId: "call-2" },
			});
		},
	);

	test.each([
		{
			action: "answer",
			details: {
				action: "answer",
				kind: "freeform",
				question: "Q?",
				answer: "A",
			} satisfies GrillAskDetails,
		},
		{
			action: "cancelled",
			details: { action: "cancelled", question: "Q?" } satisfies GrillAskDetails,
		},
		{
			action: "ui-unavailable",
			details: { action: "ui-unavailable", question: "Q?" } satisfies GrillAskDetails,
		},
	])(
		"ask -> $action -> command-like start -> close does not resurrect a pending snapshot",
		({ details }) => {
			const state = scanGrillBranch([
				userEntry("kickoff", KICKOFF_TEXT),
				askEntry("ask", "call", "Q?"),
				grillResultEntry("result", details, "call"),
				sideQuestEventEntry("mark", startedEvent("quest", "topic")),
				sideQuestEventEntry("close", closedEvent("quest")),
			]);
			expectNoPending(state);
		},
	);

	test("ignores malformed and unsupported custom events", () => {
		const state = scanGrillBranch([
			...activeBranch(),
			sideQuestEventEntry("v2", { version: 2, event: "started", questId: "q", topic: "v2" }),
			sideQuestEventEntry("missing-topic", { version: 1, event: "started", questId: "q" }),
			sideQuestEventEntry("bad-pending", {
				version: 1,
				event: "started",
				questId: "q",
				topic: "bad",
				pendingAsk: { question: 42 },
			}),
			sideQuestEventEntry("unknown", { version: 1, event: "paused", questId: "q" }),
		]);
		expect(state).not.toHaveProperty("activeQuest");
	});
});

describe("parseSideQuestSentinel", () => {
	test("parses supported prefixes and rejects ordinary or empty text", () => {
		expect(parseSideQuestSentinel("sq: what does X depend on?")).toBe("what does X depend on?");
		expect(parseSideQuestSentinel("Sidequest : first line\nsecond line")).toBe(
			"first line\nsecond line",
		);
		expect(parseSideQuestSentinel("use sq: inline")).toBeUndefined();
		expect(parseSideQuestSentinel("sq:   ")).toBeUndefined();
	});
});

describe("resolveFreeformSideQuest", () => {
	function capabilityFake(): {
		capability: GrillSidequestCapability;
		starts: Array<{ topic: string; pendingAsk: PendingGrillAsk | undefined }>;
	} {
		const starts: Array<{ topic: string; pendingAsk: PendingGrillAsk | undefined }> = [];
		return {
			capability: {
				startSideQuest: (topic, pendingAsk) => {
					starts.push({ topic, pendingAsk });
					return "quest-1";
				},
			},
			starts,
		};
	}

	test("starts through the explicit capability with canonical event intent", () => {
		const fake = capabilityFake();
		const pendingAsk = { question: "Second question?", toolCallId: "call-2" };
		const result = resolveFreeformSideQuest({
			answer: "sq: what does X depend on?",
			pendingAsk,
			ctx: { hasUI: true, ui: {}, sessionManager: { getBranch: () => activeBranch() } },
			capability: fake.capability,
		});
		expect(result?.details).toEqual({
			action: "side-quest",
			question: "Second question?",
			topic: "what does X depend on?",
		});
		expect(fake.starts).toEqual([{ topic: "what does X depend on?", pendingAsk }]);
	});

	test("active refusal does not call the capability", () => {
		const fake = capabilityFake();
		const result = resolveFreeformSideQuest({
			answer: "sq: another tangent",
			pendingAsk: { question: "Second question?", toolCallId: "call-2" },
			ctx: {
				hasUI: true,
				ui: {},
				sessionManager: {
					getBranch: () => [
						...activeBranch(),
						sideQuestEventEntry("mark", startedEvent("quest-active", "first tangent")),
					],
				},
			},
			capability: fake.capability,
		});
		expect(result?.details).toMatchObject({
			action: "side-quest-refused",
			topic: "another tangent",
		});
		expect(fake.starts).toEqual([]);
	});
});
