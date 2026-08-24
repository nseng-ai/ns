import { evaluateGrillAttempt } from "@nseng-ai/pi-runtime/grill/surfaces";

import type { GrillStatusSessionManagerLike, GrillStatusState } from "./status-protocol.ts";

/** Reconstruct the latest round-based grill attempt from branch evidence. */
export function scanGrillBranch(entries: readonly unknown[]): GrillStatusState {
	const evaluation = evaluateGrillAttempt(entries);
	if (evaluation.status === "none") return { grill: "none" };
	return {
		grill: statusForWidget(evaluation.status),
		submittedRoundCount: evaluation.submittedRoundCount,
		answeredDecisionCount: evaluation.answeredDecisionCount,
	};
}

/** Scan through a session manager, degrading to no active grill on read failure. */
export function scanGrillBranchFromSessionManager(
	sessionManager: GrillStatusSessionManagerLike | undefined,
): GrillStatusState {
	if (sessionManager === undefined) return { grill: "none" };
	try {
		const entries = sessionManager.getBranch();
		return Array.isArray(entries) ? scanGrillBranch(entries) : { grill: "none" };
	} catch {
		return { grill: "none" };
	}
}

function statusForWidget(
	status: ReturnType<typeof evaluateGrillAttempt>["status"],
): Exclude<GrillStatusState, { grill: "none" }>["grill"] {
	if (status === "active") return "active";
	if (status === "confirmed") return "confirmed";
	if (status === "ended") return "ended";
	return "failed";
}
