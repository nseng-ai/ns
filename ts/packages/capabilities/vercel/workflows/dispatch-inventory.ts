/** Package-owned dispatch steps required in every production Build Output manifest. */
export const CURRENT_DISPATCH_STEP_NAMES = [
	"checkHarnessCompletion",
	"createSandboxAndLaunchHarness",
	"failDispatchRun",
	"pushAnchorBranch",
	"readHarnessResult",
	"stopSandbox",
	"updateAnchorPrFailed",
	"updateAnchorPrLanded",
] as const;

/** Names from superseded dispatch implementations that must never survive promotion. */
export const RETIRED_DISPATCH_STEP_NAMES = [
	"launchDispatchStep",
	"pollDispatchStep",
	"landDispatchStep",
] as const;

export const DISPATCH_WORKFLOW_SOURCE = "workflows/dispatch.ts";
