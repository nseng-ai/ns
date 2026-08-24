import { describe, expect, test } from "vitest";

import {
	GRILL_ASK_ROUND_TOOL_NAME,
	evaluateGrillAttempt,
	formatGrillKickoffMarker,
	grillRoundResultEvidenceSchema,
	type GrillRoundResultEvidence,
} from "../src/kit/grill/surfaces.ts";

function kickoff(id: string, kind: "general" | "saved-plan" = "general"): unknown {
	const policy =
		kind === "general"
			? { kind: "general" as const }
			: { kind: "saved-plan" as const, maxDecisionRounds: 5 as const };
	return {
		type: "message",
		message: {
			role: "user",
			content: formatGrillKickoffMarker({ version: 1, attemptId: id, policy }),
		},
	};
}

function result(details: GrillRoundResultEvidence): unknown {
	return {
		type: "message",
		message: { role: "toolResult", toolName: GRILL_ASK_ROUND_TOOL_NAME, details },
	};
}

function submitted(roundId: string, questionIds: readonly string[]): GrillRoundResultEvidence {
	return {
		action: "submitted",
		mode: "decision-round",
		roundId,
		answers: questionIds.map((questionId) => ({
			questionId,
			kind: "option" as const,
			value: "yes",
			label: "Yes",
			recommendation: "retained" as const,
		})),
		submittedRoundCount: 999,
		answeredDecisionCount: 999,
	};
}

describe("evaluateGrillAttempt", () => {
	test("uses the latest valid kickoff and derives aggregate counts instead of trusting snapshots", () => {
		const state = evaluateGrillAttempt([
			kickoff("old"),
			result(submitted("old-round", ["old-question"])),
			kickoff("new", "saved-plan"),
			result(submitted("round-1", ["q-1", "q-2"])),
		]);

		expect(state.kickoff?.attemptId).toBe("new");
		expect(state.status).toBe("active");
		expect(state.submittedRoundCount).toBe(1);
		expect(state.answeredDecisionCount).toBe(2);
		expect([...state.submittedQuestionIds]).toEqual(["q-1", "q-2"]);
		expect(state.authorized).toBe(false);
	});

	test("supports fork/resume branch ancestry and confirmation authorization", () => {
		const branch = [
			kickoff("attempt"),
			result(submitted("round-1", ["q-1"])),
			result({ action: "confirmed", mode: "confirmation" }),
		];
		const state = evaluateGrillAttempt(branch);
		expect(state.status).toBe("confirmed");
		expect(state.authorized).toBe(true);
	});

	test.each([
		["ended", { action: "ended", mode: "decision-round", roundId: "round-2" }],
		["cancelled", { action: "cancelled", mode: "decision-round", roundId: "round-2" }],
		["ui-failed", { action: "ui-failed", mode: "decision-round", roundId: "round-2" }],
		["cap-exhausted", { action: "cap-exhausted", mode: "decision-round", roundId: "round-6" }],
	] as const)("tracks terminal %s evidence", (expected, terminal) => {
		expect(evaluateGrillAttempt([kickoff("attempt"), result(terminal)]).status).toBe(expected);
	});

	test("cancelled attempts cannot later become confirmed or authorized", () => {
		const state = evaluateGrillAttempt([
			kickoff("attempt"),
			result({ action: "cancelled", mode: "decision-round", roundId: "round-1" }),
			result({ action: "confirmed", mode: "confirmation" }),
		]);
		expect(state.status).toBe("cancelled");
		expect(state.authorized).toBe(false);
	});

	test("invalid calls do not count, reserve IDs, or poison later authorization", () => {
		const state = evaluateGrillAttempt([
			kickoff("attempt"),
			result({ action: "invalid-tool-input", errors: ["bad question"] }),
			result(submitted("round-1", ["q-1"])),
			result({ action: "confirmed", mode: "confirmation" }),
		]);
		expect(state.status).toBe("confirmed");
		expect(state.submittedRoundCount).toBe(1);
		expect(state.submittedQuestionIds.has("q-1")).toBe(true);
		expect(state.authorized).toBe(true);
	});

	test("rejects duplicate round and question IDs conservatively", () => {
		const state = evaluateGrillAttempt([
			kickoff("attempt"),
			result(submitted("round", ["q-1"])),
			result(submitted("round", ["q-1"])),
			result({ action: "confirmed", mode: "confirmation" }),
		]);
		expect(state.status).toBe("invalid");
		expect(state.hasDuplicateIds).toBe(true);
		expect(state.authorized).toBe(false);
	});

	test("treats a malformed latest kickoff as an invalid attempt boundary", () => {
		const malformedKickoff = {
			type: "message",
			message: { role: "user", content: "<ns-grill-kickoff>{oops}</ns-grill-kickoff>" },
		};
		const state = evaluateGrillAttempt([
			kickoff("old"),
			result(submitted("old-round", ["old-q"])),
			malformedKickoff,
			result(submitted("new-round", ["new-q"])),
			result({ action: "confirmed", mode: "confirmation" }),
		]);
		expect(state.kickoff).toBeUndefined();
		expect(state.submittedRoundCount).toBe(0);
		expect(state.status).toBe("invalid");
		expect(state.authorized).toBe(false);
	});

	test("malformed latest-attempt results deny authorization", () => {
		const malformedResult = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: GRILL_ASK_ROUND_TOOL_NAME,
				details: { action: "confirmed", mode: "wrong" },
			},
		};
		const state = evaluateGrillAttempt([
			kickoff("valid"),
			result(submitted("round", ["q"])),
			malformedResult,
			result({ action: "confirmed", mode: "confirmation" }),
		]);
		expect(state.kickoff?.attemptId).toBe("valid");
		expect(state.status).toBe("invalid");
		expect(state.authorized).toBe(false);
	});

	test("rejects answer evidence that violates the kind-specific contract", () => {
		const common = {
			action: "submitted",
			mode: "decision-round",
			roundId: "round",
			submittedRoundCount: 1,
			answeredDecisionCount: 1,
		};
		expect(
			grillRoundResultEvidenceSchema.safeParse({
				...common,
				answers: [
					{
						questionId: "q",
						kind: "option",
						value: "yes",
						recommendation: "retained",
					},
				],
			}).success,
		).toBe(false);
		expect(
			grillRoundResultEvidenceSchema.safeParse({
				...common,
				answers: [
					{
						questionId: "q",
						kind: "freeform",
						value: "custom",
						recommendation: "retained",
					},
				],
			}).success,
		).toBe(false);
	});
});
