import { describe, expect, test } from "vitest";

import {
	formatGrillKickoffMarker,
	GRILL_ASK_ROUND_TOOL_NAME,
	type GrillRoundResultEvidence,
} from "@nseng-ai/pi-runtime/grill/surfaces";

import {
	scanGrillBranch,
	scanGrillBranchFromSessionManager,
} from "../../src/grill/status-state.ts";

function kickoff(attemptId = "attempt"): unknown {
	return {
		type: "message",
		message: {
			role: "user",
			content: formatGrillKickoffMarker({
				version: 1,
				attemptId,
				policy: { kind: "general" },
			}),
		},
	};
}

function result(details: GrillRoundResultEvidence): unknown {
	return {
		type: "message",
		message: { role: "toolResult", toolName: GRILL_ASK_ROUND_TOOL_NAME, details },
	};
}

const SUBMITTED: GrillRoundResultEvidence = {
	action: "submitted",
	mode: "decision-round",
	roundId: "round-1",
	answers: [
		{
			questionId: "q-1",
			kind: "option",
			value: "recommended",
			label: "Recommended",
			recommendation: "retained",
		},
	],
	submittedRoundCount: 1,
	answeredDecisionCount: 1,
};

describe("scanGrillBranch", () => {
	test("reports latest attempt round and decision counts", () => {
		expect(scanGrillBranch([])).toEqual({ grill: "none" });
		expect(scanGrillBranch([kickoff(), result(SUBMITTED)])).toEqual({
			grill: "active",
			submittedRoundCount: 1,
			answeredDecisionCount: 1,
		});
	});

	test("maps explicit confirmation and fail-closed terminal evidence", () => {
		expect(
			scanGrillBranch([
				kickoff(),
				result(SUBMITTED),
				result({ action: "confirmed", mode: "confirmation" }),
			]),
		).toEqual({ grill: "confirmed", submittedRoundCount: 1, answeredDecisionCount: 1 });
		expect(
			scanGrillBranch([
				kickoff(),
				result({ action: "ui-failed", mode: "decision-round", roundId: "round-1" }),
			]),
		).toEqual({ grill: "failed", submittedRoundCount: 0, answeredDecisionCount: 0 });
	});

	test("a fresh kickoff resets the namespace and visible progress", () => {
		expect(scanGrillBranch([kickoff("old"), result(SUBMITTED), kickoff("new")])).toEqual({
			grill: "active",
			submittedRoundCount: 0,
			answeredDecisionCount: 0,
		});
	});
});

describe("scanGrillBranchFromSessionManager", () => {
	test("degrades to no grill for absent, malformed, or failing reads", () => {
		expect(scanGrillBranchFromSessionManager(undefined)).toEqual({ grill: "none" });
		expect(scanGrillBranchFromSessionManager({ getBranch: () => "bad" as never })).toEqual({
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
