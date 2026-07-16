import type { DispatchHarness } from "./harness-registry.ts";
import type { DispatchRunFailureCode, DispatchRunInput } from "./dispatch-run.ts";

export type DispatchWorkflowPhase =
	| "queued"
	| "launching"
	| "running"
	| "reading-result"
	| "landing"
	| "cleaning"
	| "completed"
	| "failed";

export type DispatchWorkflowEvent =
	| {
			readonly event: "dispatch_step_started";
			readonly step:
				| "launch"
				| "poll"
				| "read-result"
				| "land"
				| "cleanup"
				| "update-anchor-pr"
				| "terminal-failure";
			readonly anchorPrNumber?: number;
			readonly sandboxName?: string;
			readonly pollOrdinal?: number;
	  }
	| {
			readonly event: "dispatch_step_finished";
			readonly step: "launch" | "poll" | "read-result" | "land" | "cleanup" | "update-anchor-pr";
			readonly outcome: "succeeded" | "failed" | "running" | "done";
			readonly anchorPrNumber?: number;
			readonly sandboxName?: string;
			readonly harness?: DispatchHarness;
			readonly pollOrdinal?: number;
			readonly failureCode?: DispatchRunFailureCode;
	  }
	| {
			readonly event: "observability_write_failed";
			readonly operation: "set-attributes" | "status-stream";
	  };

export type DispatchWorkflowAttributes = Readonly<Record<string, string>>;

export function buildDispatchStartAttributes(input: DispatchRunInput): DispatchWorkflowAttributes {
	return {
		"dispatch.kind": "prompt" in input ? "prompt" : "plan",
		"dispatch.anchor_pr": String(input.anchorPrNumber),
		"dispatch.phase": "queued",
		...("dispatchId" in input ? { "dispatch.id": input.dispatchId } : {}),
	};
}

export function buildDispatchPhaseAttributes(
	phase: DispatchWorkflowPhase,
): DispatchWorkflowAttributes {
	return { "dispatch.phase": phase };
}

export function buildDispatchRunningAttributes(
	harness: DispatchHarness,
): DispatchWorkflowAttributes {
	return { "dispatch.phase": "running", "dispatch.harness": harness };
}

export function buildDispatchFailureAttributes(
	code: DispatchRunFailureCode,
): DispatchWorkflowAttributes {
	return { "dispatch.phase": "failed", "dispatch.failure_code": code };
}

export function emitDispatchWorkflowEvent(
	event: DispatchWorkflowEvent,
	sink: (serializedEvent: string) => void = console.info,
): void {
	sink(JSON.stringify(event));
}
