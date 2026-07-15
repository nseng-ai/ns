import { validateDispatchRunInput, type DispatchRunInput } from "../dispatch/dispatch-run.ts";
import { isValidDispatchRunId } from "../dispatch/run-id-stamp.ts";
import type { DispatchClientGateways, DispatchTriggerConnection } from "./contracts.ts";

export interface DispatchSource {
	readonly repoRoot: string;
	readonly branch: string;
	readonly headSha: string;
}

export type DispatchSourceCheckResult =
	| { readonly status: "ready"; readonly source: DispatchSource }
	| { readonly status: "dirty-tree"; readonly dirtyPaths: readonly string[] }
	| {
			readonly status: "source-unusable";
			readonly code: "not-a-repository" | "detached-head" | "git-read-failed";
			readonly message: string;
	  };

export type DispatchSourceReachabilityResult =
	| { readonly status: "ready"; readonly isSourcePushed: boolean }
	| {
			readonly status: "source-unusable";
			readonly code: "git-read-failed";
			readonly message: string;
	  }
	| {
			readonly status: "source-push-failed";
			readonly sourceBranch: string;
			readonly message: string;
	  };

export async function resolveDispatchSource(
	options: { readonly cwd: string },
	gateways: Pick<DispatchClientGateways, "git">,
): Promise<DispatchSourceCheckResult> {
	const sourceRef = await gateways.git.resolveSourceRef(options);
	if (sourceRef.ok === false) {
		return {
			status: "source-unusable",
			code: sourceRef.error.code,
			message: sourceRef.error.message,
		};
	}
	const dirty = await gateways.git.listDirtyPaths(options);
	if (dirty.ok === false) {
		return { status: "source-unusable", code: "git-read-failed", message: dirty.error.message };
	}
	if (dirty.value.length > 0) return { status: "dirty-tree", dirtyPaths: dirty.value };
	return { status: "ready", source: sourceRef.value };
}

export async function ensureDispatchSourceReachable(
	options: { readonly cwd: string; readonly branch: string; readonly headSha: string },
	gateways: Pick<DispatchClientGateways, "git">,
): Promise<DispatchSourceReachabilityResult> {
	const remoteTip = await gateways.git.readRemoteBranchTip(options);
	if (remoteTip.type === "error") {
		return { status: "source-unusable", code: "git-read-failed", message: remoteTip.error.message };
	}
	if (remoteTip.type === "found" && remoteTip.sha === options.headSha) {
		return { status: "ready", isSourcePushed: false };
	}
	const push = await gateways.git.pushSourceBranch(options);
	if (push.ok === false) {
		return {
			status: "source-push-failed",
			sourceBranch: options.branch,
			message: push.error.message,
		};
	}
	return { status: "ready", isSourcePushed: true };
}

export interface DispatchAnchorPr {
	readonly branch: string;
	readonly number: number;
	readonly url: string;
}

export type DispatchAnchorCreationResult =
	| { readonly status: "ready"; readonly anchorPr: DispatchAnchorPr }
	| {
			readonly status: "anchor-push-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  }
	| {
			readonly status: "anchor-pr-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  };

/** Push and open an anchor whose variant-specific identity and content are already decided. */
export async function createDispatchAnchor(
	options: {
		readonly cwd: string;
		readonly revision: string;
		readonly anchorBranch: string;
		readonly baseBranch: string;
		readonly title: string;
		readonly body: string;
	},
	gateways: Pick<DispatchClientGateways, "git" | "anchorPrs">,
): Promise<DispatchAnchorCreationResult> {
	const pushed = await gateways.git.pushAnchorBranch(options);
	if (pushed.ok === false) {
		return {
			status: "anchor-push-failed",
			anchorBranch: options.anchorBranch,
			message: pushed.error.message,
		};
	}
	const opened = await gateways.anchorPrs.openAnchorPr(options);
	if (opened.ok === false) {
		return {
			status: "anchor-pr-failed",
			anchorBranch: options.anchorBranch,
			message: opened.error.message,
		};
	}
	return {
		status: "ready",
		anchorPr: { branch: options.anchorBranch, number: opened.value.number, url: opened.value.url },
	};
}

export type DispatchWorkflowStartResult =
	| {
			readonly status: "ready";
			readonly runInput: DispatchRunInput;
			readonly runId: string;
			readonly workflowRunUrl: string;
	  }
	| {
			readonly status: "trigger-failed";
			readonly code: string;
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
	  }
	| {
			readonly status: "run-id-stamp-failed";
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
			readonly runId?: string;
	  };

/** Validate and start one variant-specific run, then validate and stamp its run ID. */
export async function startDispatchWorkflow(
	options: {
		readonly cwd: string;
		readonly input: DispatchRunInput;
		readonly anchorPr: DispatchAnchorPr;
		readonly connection: DispatchTriggerConnection;
		readonly workflowDashboardUrl: string;
		readonly onPhase?: (message: string) => void;
	},
	gateways: Pick<DispatchClientGateways, "trigger" | "anchorPrs">,
): Promise<DispatchWorkflowStartResult> {
	const runInput = validateDispatchRunInput(options.input);
	if (runInput.ok === false) {
		return {
			status: "trigger-failed",
			code: "invalid-request",
			message: runInput.message,
			anchorPr: options.anchorPr,
		};
	}

	options.onPhase?.("Starting the remote workflow…");
	const started = await gateways.trigger.startDispatchRun({
		connection: options.connection,
		input: runInput.value,
	});
	if (started.ok === false) {
		return {
			status: "trigger-failed",
			code: started.error.code,
			message: started.error.message,
			anchorPr: options.anchorPr,
		};
	}
	const runId = started.value.runId;
	if (!isValidDispatchRunId(runId)) {
		return {
			status: "run-id-stamp-failed",
			message: "The trigger route returned a run id that cannot be stamped safely.",
			anchorPr: options.anchorPr,
		};
	}

	options.onPhase?.("Recording the workflow run on the anchor PR…");
	const stamp = await gateways.anchorPrs.stampAnchorPrRunId({
		cwd: options.cwd,
		prNumber: options.anchorPr.number,
		runId,
	});
	if (stamp.ok === false) {
		return {
			status: "run-id-stamp-failed",
			message: stamp.error.message,
			anchorPr: options.anchorPr,
			runId,
		};
	}

	return {
		status: "ready",
		runInput: runInput.value,
		runId,
		workflowRunUrl: buildWorkflowRunUrl(options.workflowDashboardUrl, runId),
	};
}

function buildWorkflowRunUrl(workflowDashboardUrl: string, runId: string): string {
	const base = workflowDashboardUrl.replace(/\/$/, "");
	return `${base}/runs/${encodeURIComponent(runId)}?environment=production`;
}
