// Probe-neutral deterministic supervision shared by dispatch and the long-run probe.
export interface SupervisionPlan {
	readonly pollIntervalMs: number;
	readonly maxPolls: number;
	readonly sandboxTimeoutMs: number;
}

export type SupervisionPollResult<Diagnostic = never> =
	| { readonly ok: true; readonly phase: "running" | "done" }
	| {
			readonly ok: false;
			readonly code: "poll-failed";
			readonly message: string;
			readonly diagnostic?: Diagnostic;
	  };

export type SupervisionOutcome<Diagnostic = never> =
	| { readonly completed: true; readonly polls: number }
	| {
			readonly completed: false;
			readonly code: "poll-failed" | "run-timed-out";
			readonly polls: number;
			readonly diagnostic?: Diagnostic;
	  };

export type SupervisionCleanupResult<Diagnostic = never> =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly code: "sandbox-cleanup-failed";
			readonly message: string;
			readonly diagnostic?: Diagnostic;
	  };

export interface SuperviseDetachedRunDeps<Diagnostic = never> {
	sleep(durationMs: number): Promise<void>;
	poll(pollOrdinal: number): Promise<SupervisionPollResult<Diagnostic>>;
}

/**
 * Poll immediately after launch, then sleep between polls. This records an
 * early liveness point instead of presenting the first poll interval as an
 * unexplained idle gap. One failed poll is tolerated; a second consecutive
 * failure ends supervision. Every failed attempt consumes the fixed budget,
 * and any successful poll resets the consecutive-failure count.
 */
export async function superviseDetachedRun<Diagnostic = never>(
	plan: SupervisionPlan,
	deps: SuperviseDetachedRunDeps<Diagnostic>,
): Promise<SupervisionOutcome<Diagnostic>> {
	let consecutiveFailures = 0;
	let latestFailureDiagnostic: Diagnostic | undefined;
	for (let polls = 1; polls <= plan.maxPolls; polls++) {
		if (polls > 1) await deps.sleep(plan.pollIntervalMs);
		const poll = await deps.poll(polls);
		if (poll.ok === false) {
			consecutiveFailures += 1;
			latestFailureDiagnostic = poll.diagnostic;
			if (consecutiveFailures >= 2) {
				return {
					completed: false,
					code: "poll-failed",
					polls,
					...(latestFailureDiagnostic === undefined ? {} : { diagnostic: latestFailureDiagnostic }),
				};
			}
			continue;
		}
		consecutiveFailures = 0;
		if (poll.phase === "done") return { completed: true, polls };
	}
	return { completed: false, code: "run-timed-out", polls: plan.maxPolls };
}
