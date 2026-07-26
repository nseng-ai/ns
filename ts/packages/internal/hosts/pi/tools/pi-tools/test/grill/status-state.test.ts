import { describe, expect, test } from "vitest";

import type { GrillAskDetails } from "../../src/grill/result.ts";
import {
	scanGrillBranch,
	scanGrillBranchFromSessionManager,
} from "../../src/grill/status-state.ts";

const KICKOFF_TEXT = "<structured-grill-question-ui-contract>\nplan under grill";

function userEntry(id: string, text: string): unknown {
	return { type: "message", id, message: { role: "user", content: text } };
}

interface AskEntryOptions {
	id: string;
	toolCallId: string;
	question: string;
	estimatedRemaining?: unknown;
}

function askEntry(options: AskEntryOptions): unknown {
	return {
		type: "message",
		id: options.id,
		message: {
			role: "assistant",
			content: [
				{
					type: "toolCall",
					id: options.toolCallId,
					name: "grill_ask",
					arguments: {
						question: options.question,
						...(options.estimatedRemaining === undefined
							? {}
							: { estimatedRemaining: options.estimatedRemaining }),
					},
				},
			],
		},
	};
}

function resultEntry(id: string, details: GrillAskDetails, toolCallId?: string): unknown {
	return {
		type: "message",
		id,
		message: {
			role: "toolResult",
			toolName: "grill_ask",
			...(toolCallId === undefined ? {} : { toolCallId }),
			details,
		},
	};
}

function activeBranch(): unknown[] {
	return [
		userEntry("kickoff", KICKOFF_TEXT),
		askEntry({ id: "ask-1", toolCallId: "call-1", question: "First question?" }),
		resultEntry(
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
		askEntry({
			id: "ask-2",
			toolCallId: "call-2",
			question: "Second question?",
			estimatedRemaining: {
				kind: "range",
				min: 2,
				max: 4,
				basis: "two branches",
			},
		}),
	];
}

describe("scanGrillBranch", () => {
	test("requires a kickoff and reports the current pending call", () => {
		expect(scanGrillBranch([askEntry({ id: "ask", toolCallId: "call", question: "Q?" })])).toEqual({
			grill: "none",
		});
		expect(scanGrillBranch(activeBranch())).toEqual({
			grill: "active",
			answeredCount: 1,
			remainingEstimate: { kind: "range", min: 2, max: 4, basis: "two branches" },
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
			hasPending: false,
		},
		{
			name: "status-request",
			details: {
				action: "status-request",
				question: "Second question?",
				progressSource: "unavailable",
			} satisfies GrillAskDetails,
			answeredCount: 1,
			hasPending: true,
		},
		{
			name: "cancelled",
			details: { action: "cancelled", question: "Second question?" } satisfies GrillAskDetails,
			answeredCount: 1,
			hasPending: false,
		},
		{
			name: "ui-unavailable",
			details: {
				action: "ui-unavailable",
				question: "Second question?",
			} satisfies GrillAskDetails,
			answeredCount: 1,
			hasPending: false,
		},
		{
			name: "invalid-tool-input",
			details: { action: "invalid-tool-input", errors: ["bad"] } satisfies GrillAskDetails,
			answeredCount: 1,
			hasPending: false,
		},
	])("applies the $name transition", ({ details, answeredCount, hasPending }) => {
		const state = scanGrillBranch([...activeBranch(), resultEntry("result", details, "call-2")]);
		expect(state).toMatchObject({ grill: "active", answeredCount });
		if (hasPending) expect(state).toHaveProperty("pendingAsk.toolCallId", "call-2");
		else expect(state).not.toHaveProperty("pendingAsk");
	});

	test("end-grill ends the current grill", () => {
		expect(
			scanGrillBranch([
				...activeBranch(),
				resultEntry("end", { action: "end-grill", question: "Second question?" }, "call-2"),
			]),
		).toEqual({ grill: "ended", answeredCount: 1 });
	});

	test("matches results to pending calls and accepts an id-less fallback", () => {
		const mismatch = scanGrillBranch([
			...activeBranch(),
			resultEntry("other", { action: "cancelled", question: "Other?" }, "call-other"),
		]);
		expect(mismatch).toHaveProperty("pendingAsk.toolCallId", "call-2");

		const idless = scanGrillBranch([
			...activeBranch(),
			resultEntry("idless", { action: "cancelled", question: "Second question?" }),
		]);
		expect(idless).not.toHaveProperty("pendingAsk");
	});

	test("scopes reconstruction to the latest kickoff", () => {
		const state = scanGrillBranch([
			...activeBranch(),
			userEntry("latest", `${KICKOFF_TEXT}\nnew target`),
			askEntry({ id: "ask-new", toolCallId: "call-new", question: "New first question?" }),
		]);
		expect(state).toEqual({
			grill: "active",
			answeredCount: 0,
			pendingAsk: { question: "New first question?", toolCallId: "call-new" },
		});
	});

	test("ends after an answered question with an exhausted estimate", () => {
		for (const estimatedRemaining of [
			{ kind: "exact", count: 0 },
			{ kind: "range", min: 0, max: 0, basis: "all resolved" },
		]) {
			expect(
				scanGrillBranch([
					userEntry("kickoff", KICKOFF_TEXT),
					askEntry({
						id: "ask",
						toolCallId: "call",
						question: "Final question?",
						estimatedRemaining,
					}),
					resultEntry(
						"answer",
						{ action: "answer", kind: "freeform", question: "Final question?", answer: "Yes" },
						"call",
					),
				]),
			).toEqual({ grill: "ended", answeredCount: 1 });
		}
	});

	test("ignores malformed current entries and unsupported result actions", () => {
		const state = scanGrillBranch([
			userEntry("kickoff", KICKOFF_TEXT),
			{ type: "message", message: { role: "assistant", content: null } },
			{
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", name: "grill_ask", arguments: { question: 42 } }],
				},
			},
			{
				type: "message",
				message: { role: "toolResult", toolName: "grill_ask", details: { action: "unknown" } },
			},
			askEntry({
				id: "valid",
				toolCallId: "call",
				question: "Valid question?",
				estimatedRemaining: {
					kind: "range",
					min: 3,
					max: 1,
					basis: "invalid",
				},
			}),
		]);
		expect(state).toEqual({
			grill: "active",
			answeredCount: 0,
			pendingAsk: { question: "Valid question?", toolCallId: "call" },
		});
	});
});

describe("scanGrillBranchFromSessionManager", () => {
	test("degrades to no grill for absent, malformed, or failing reads", () => {
		expect(scanGrillBranchFromSessionManager(undefined)).toEqual({ grill: "none" });
		expect(scanGrillBranchFromSessionManager({ getBranch: () => "not entries" as never })).toEqual({
			grill: "none",
		});
		expect(
			scanGrillBranchFromSessionManager({
				getBranch: () => {
					throw new Error("read failed");
				},
			}),
		).toEqual({ grill: "none" });
	});
});
