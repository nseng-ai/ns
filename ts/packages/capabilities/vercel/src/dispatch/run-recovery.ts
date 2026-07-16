// Recovery lookup for the vendor-generated Workflow run id (`wrun_...`) by
// the exact ns-generated Dispatch ID. Workflow start seeds the Dispatch ID
// as the `dispatch.id` run attribute (see `workflow-observability.ts`); when
// the run id retained from the normal start path is lost, this lookup finds
// it again through Workflow Analytics. Attribute lookup is eventually
// observable, time-windowed, and does not enforce uniqueness, so the lookup
// requests at most two matches and reports zero and multiple matches as
// explicit outcomes — it never guesses.
import { DISPATCH_ID_MAX_CHARS } from "./dispatch-context.ts";
import { isValidDispatchRunId } from "./validation.ts";

/**
 * How many runs the lookup requests from Workflow Analytics: exactly enough
 * to distinguish "one match" from "more than one match" without listing.
 */
export const DISPATCH_RUN_RECOVERY_MATCH_LIMIT = 2;

export type DispatchRunRecoveryListResult =
	| { readonly type: "listed"; readonly runIds: readonly string[] }
	| { readonly type: "analytics-unavailable" }
	| { readonly type: "error" };

/**
 * Gateway seam over the Workflow Analytics exact-attribute run listing.
 * `analytics-unavailable` is a distinct result because the Analytics
 * namespace is optional on the Workflow world (the local development world
 * leaves it undefined); callers should surface it as a deployment-side
 * capability gap, not a transient read failure.
 */
export interface DispatchRunRecoveryGateway {
	listRunIdsByDispatchId(options: {
		readonly dispatchId: string;
		readonly maxRuns: number;
	}): Promise<DispatchRunRecoveryListResult>;
}

export type DispatchRunRecoveryOutcome =
	| { readonly type: "found"; readonly dispatchId: string; readonly runId: string }
	| { readonly type: "not-found"; readonly dispatchId: string }
	| {
			/**
			 * More than one run carries the Dispatch ID attribute. The two
			 * requested matches are evidence for reporting; the true match
			 * cannot be determined, so recovery refuses to pick one.
			 */
			readonly type: "ambiguous";
			readonly dispatchId: string;
			readonly matchedRunIds: readonly [string, string];
	  }
	| { readonly type: "invalid-dispatch-id"; readonly message: string }
	| { readonly type: "analytics-unavailable"; readonly dispatchId: string }
	| { readonly type: "lookup-failed"; readonly dispatchId: string };

/**
 * Recover the vendor-generated Workflow run id for one Dispatch ID through
 * exact `dispatch.id` attribute lookup. Zero matches, multiple matches,
 * unavailable analytics, and read failures are all explicit outcomes.
 */
export async function recoverDispatchWorkflowRunId(
	options: { readonly dispatchId: string },
	gateway: DispatchRunRecoveryGateway,
): Promise<DispatchRunRecoveryOutcome> {
	const { dispatchId } = options;
	if (dispatchId.length < 1 || dispatchId.length > DISPATCH_ID_MAX_CHARS) {
		return {
			type: "invalid-dispatch-id",
			message: `dispatchId must be between 1 and ${DISPATCH_ID_MAX_CHARS} characters.`,
		};
	}

	const listed = await gateway.listRunIdsByDispatchId({
		dispatchId,
		maxRuns: DISPATCH_RUN_RECOVERY_MATCH_LIMIT,
	});
	if (listed.type === "analytics-unavailable") {
		return { type: "analytics-unavailable", dispatchId };
	}
	if (listed.type === "error") return { type: "lookup-failed", dispatchId };

	// The same run listed twice is one match, not an ambiguity; distinct
	// entries with the same run id can only be duplicate records of one run.
	const runIds = [...new Set(listed.runIds)];
	if (runIds.some((runId) => !isValidDispatchRunId(runId))) {
		return { type: "lookup-failed", dispatchId };
	}

	const [first, second] = runIds;
	if (first === undefined) return { type: "not-found", dispatchId };
	if (second === undefined) return { type: "found", dispatchId, runId: first };
	return { type: "ambiguous", dispatchId, matchedRunIds: [first, second] };
}
