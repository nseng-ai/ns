// The harness-invocation configuration seam: which agent harness runs
// inside the dispatch sandbox is repo configuration — a provisioning recipe
// plus an invocation command — not code shape (orientation rule). The
// dispatch workflow's launch step consumes this contract; tests drive it
// with fakes, and the ns-owned pi runner (the next roadmap step) is its
// first real value. Workflow steps stay orchestration-only: no harness
// logic lives here or in the steps, only the commands that provision and
// start it.
//
// The invocation contract, from the sandbox's perspective (the checkout is
// the sandbox's working directory, so the repo's ns skills are already
// present — no injection layer):
//
// - Provision commands run first, sequentially, in the checkout; each must
//   exit 0. They install the harness runtime (per-run provisioning is v1;
//   warm sandbox templates are parked).
// - The workflow writes the dispatched prompt to `DISPATCH_PROMPT_PATH`
//   before launching.
// - The launch command starts the harness headless and detached; it must
//   read its unit of work from `DISPATCH_PROMPT_PATH`, commit produced work
//   onto the checkout's `HEAD`, write its decision log to
//   `DISPATCH_DECISION_LOG_PATH`, and finally write the completion JSON
//   (`{ "outcome": "completed" | "failed", "summary"?: string }`) to
//   `DISPATCH_RESULT_PATH`. The result file's existence is the completion
//   signal the poll steps watch.
// - Model keys are configuration, not workflow data: the launch step copies
//   the named variables from the deployable's environment into the detached
//   launch command's own environment. They are never journaled, logged, or
//   placed in the sandbox-wide environment, and no push-capable git
//   credential exists in the sandbox at any point.
import type { DispatchSandboxCommand } from "./dispatch-run.ts";

export interface HarnessInvocation {
	/** Sequential provisioning commands; each must exit 0. */
	readonly provisionCommands: readonly DispatchSandboxCommand[];
	/** The detached, headless harness launch command. */
	readonly launchCommand: DispatchSandboxCommand;
	/**
	 * Names of deployable environment variables (model keys and similar
	 * harness configuration) injected into the launch command's environment.
	 * Names only — values stay in the deployable's environment and the
	 * launch step's memory.
	 */
	readonly launchEnvironmentVariableNames: readonly string[];
}

export type HarnessInvocationResolution =
	| { readonly ok: true; readonly value: HarnessInvocation }
	| { readonly ok: false; readonly code: "harness-not-configured" };

export type HarnessInvocationResolver = () => HarnessInvocationResolution;

/**
 * Resolve the deployable's configured harness invocation. No harness is
 * configured yet: the ns-owned pi runner (the next steel-thread sub-slice)
 * supplies the first real invocation — until then a deployed dispatch
 * workflow fails its launch step cleanly as `dispatch-misconfigured`
 * instead of launching nothing.
 */
export function resolveConfiguredHarnessInvocation(): HarnessInvocationResolution {
	return { ok: false, code: "harness-not-configured" };
}
