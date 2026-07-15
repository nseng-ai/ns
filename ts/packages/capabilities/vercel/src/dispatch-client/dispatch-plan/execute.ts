import { preflightDispatchBrmemSetup } from "./delivery-preflight.ts";
import {
	deliverPreparedDispatchPlan,
	type DispatchPlanDeliveryOutcome,
	type DispatchPlanDurableArtifact,
} from "./delivery.ts";
import { prepareDispatchPlan } from "./preparation.ts";
import {
	buildAnchorBranchName,
	buildAnchorPrTitle,
	buildPlanAnchorPrBody,
} from "../../dispatch-client/content.ts";
import type { DispatchPlanGateways } from "../../dispatch-client/contracts.ts";
import {
	createDispatchAnchor,
	ensureDispatchSourceReachable,
	resolveDispatchSource,
	startDispatchWorkflow,
	type DispatchAnchorPr,
} from "../../dispatch-client/core.ts";
import {
	runDispatchPreflight,
	type DispatchPreflightCheck,
} from "../../dispatch-client/prompt-core.ts";

export interface DispatchPlanRequest {
	readonly cwd: string;
	readonly planRef: string;
	readonly onPhase?: (message: string) => void;
}

/** The plan core's outcome union; the command handler maps it to exit shapes. */
export type DispatchPlanOutcome =
	| {
			readonly status: "dispatched";
			readonly dispatchId: string;
			readonly revision: string;
			readonly sourceBranch: string;
			readonly isSourcePushed: boolean;
			readonly locator: Extract<
				DispatchPlanDeliveryOutcome,
				{ readonly status: "ready" }
			>["locator"];
			readonly anchorPr: DispatchAnchorPr;
			readonly runId: string;
			readonly workflowRunUrl: string;
	  }
	| Exclude<DispatchPlanDeliveryOutcome, { readonly status: "ready" }>
	| { readonly status: "dirty-tree"; readonly dirtyPaths: readonly string[] }
	| { readonly status: "preflight-failed"; readonly checks: readonly DispatchPreflightCheck[] }
	| {
			readonly status: "source-unusable";
			readonly code: "not-a-repository" | "detached-head" | "git-read-failed";
			readonly message: string;
	  }
	| {
			readonly status: "source-push-failed";
			readonly sourceBranch: string;
			readonly message: string;
	  }
	| PlanPostDeliveryFailure;

type DispatchPlanDeliveryEvidence = {
	readonly dispatchId: string;
	readonly artifacts: readonly [DispatchPlanDurableArtifact, DispatchPlanDurableArtifact];
};

type PlanPostDeliveryFailure =
	| (DispatchPlanDeliveryEvidence & {
			readonly status: "anchor-push-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  })
	| (DispatchPlanDeliveryEvidence & {
			readonly status: "anchor-pr-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  })
	| (DispatchPlanDeliveryEvidence & {
			readonly status: "trigger-failed";
			readonly code: string;
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
	  })
	| (DispatchPlanDeliveryEvidence & {
			readonly status: "run-id-stamp-failed";
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
			readonly runId?: string;
	  });

/** Execute one Saved Plan dispatch through the shared local spine. */
export async function executeDispatchPlan(
	request: DispatchPlanRequest,
	gateways: DispatchPlanGateways,
): Promise<DispatchPlanOutcome> {
	request.onPhase?.("Checking the source branch and worktree…");
	const sourceResult = await resolveDispatchSource({ cwd: request.cwd }, gateways);
	if (sourceResult.status !== "ready") return sourceResult;
	const { repoRoot, branch, headSha } = sourceResult.source;

	request.onPhase?.("Validating dispatch configuration and identity…");
	const preflight = await runDispatchPreflight({ repoRoot }, gateways);
	if (preflight.ok === false) return { status: "preflight-failed", checks: preflight.checks };

	// Preparation creates dispatch identity and resolves the exact plan before
	// the first external mutation, so every later artifact can be correlated
	// even across a partial failure.
	request.onPhase?.("Resolving the Saved Plan…");
	const preparation = await prepareDispatchPlan(request, gateways);
	if (preparation.status !== "ready") return preparation;
	const brmemPreflight = await preflightDispatchBrmemSetup(gateways.brmem);
	if (brmemPreflight.status !== "ready") {
		return {
			...brmemPreflight,
			dispatchId: preparation.dispatchId,
			artifacts: [],
		};
	}

	request.onPhase?.("Ensuring the source revision is remotely reachable…");
	const reachable = await ensureDispatchSourceReachable(
		{ cwd: request.cwd, branch, headSha },
		gateways,
	);
	if (reachable.status !== "ready") return reachable;
	const { isSourcePushed } = reachable;

	request.onPhase?.("Delivering the Saved Plan through Branch Memory…");
	const delivery = await deliverPreparedDispatchPlan(
		request,
		preparation,
		gateways,
		brmemPreflight.remote,
	);
	if (delivery.status !== "ready") return delivery;
	const evidence: DispatchPlanDeliveryEvidence = {
		dispatchId: delivery.dispatchId,
		artifacts: delivery.artifacts,
	};

	request.onPhase?.("Creating the anchor branch and pull request…");
	const anchorBranch = buildAnchorBranchName(branch, delivery.dispatchId);
	const anchor = await createDispatchAnchor(
		{
			cwd: request.cwd,
			revision: headSha,
			anchorBranch,
			baseBranch: branch,
			title: buildAnchorPrTitle(`Execute Saved Plan: ${request.planRef}`),
			body: buildPlanAnchorPrBody({
				planRef: request.planRef,
				revision: headSha,
				locator: delivery.locator,
			}),
		},
		gateways,
	);
	if (anchor.status !== "ready") return withDeliveryEvidence(anchor, evidence);

	const workflow = await startDispatchWorkflow(
		{
			cwd: request.cwd,
			input: {
				revision: headSha,
				anchorBranch: anchor.anchorPr.branch,
				anchorPrNumber: anchor.anchorPr.number,
				dispatchId: delivery.dispatchId,
				contextLocator: delivery.locator,
			},
			anchorPr: anchor.anchorPr,
			connection: preflight.triggerConnection,
			workflowDashboardUrl: preflight.workflowDashboardUrl,
			...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
		},
		gateways,
	);
	if (workflow.status !== "ready") return withDeliveryEvidence(workflow, evidence);

	return {
		status: "dispatched",
		dispatchId: delivery.dispatchId,
		revision: workflow.runInput.revision,
		sourceBranch: branch,
		isSourcePushed,
		locator: delivery.locator,
		anchorPr: anchor.anchorPr,
		runId: workflow.runId,
		workflowRunUrl: workflow.workflowRunUrl,
	};
}

function withDeliveryEvidence<T extends { readonly status: PlanPostDeliveryFailure["status"] }>(
	failure: T,
	evidence: DispatchPlanDeliveryEvidence,
): T & DispatchPlanDeliveryEvidence {
	return { ...failure, ...evidence };
}
