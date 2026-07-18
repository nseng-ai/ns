import {
	buildBranchContextPlanKey,
	ensureAttachedPlan,
	type AttachedPlanEvidence,
} from "@nseng-ai/branch-context/api";

import {
	buildDispatchAnchorNameCandidates,
	formatDispatchAnchorTimestamp,
} from "../anchor-name.ts";
import { deliverInstructionsAndStartRun } from "../anchor-to-run.ts";
import { buildAnchorPrTitle, buildPlanAnchorPrBody } from "../content.ts";
import type { DispatchPlanGateways } from "../contracts.ts";
import { createDispatchAnchor, resolveDispatchSource, type DispatchAnchorPr } from "../core.ts";
import type {
	DispatchInstructionDeliveryOutcome,
	DispatchInstructionDurableArtifact,
} from "../instruction-delivery.ts";
import { runDispatchPreflight, type DispatchPreflightCheck } from "../preflight.ts";
import { prepareDispatchSource } from "../source-preparation.ts";
import { preflightDispatchBrmemSetup } from "./delivery-preflight.ts";
import { prepareDispatchPlan } from "./preparation.ts";

export interface DispatchPlanRequest {
	readonly cwd: string;
	readonly planRef: string;
	readonly onPhase?: (message: string) => void;
}

type DeliveryFailure = Exclude<DispatchInstructionDeliveryOutcome, { readonly status: "ready" }>;

export type DispatchPlanOutcome =
	| {
			readonly status: "dispatched";
			readonly dispatchId: string;
			readonly revision: string;
			readonly sourceBranch: string;
			readonly isSourcePushed: boolean;
			readonly locator: Extract<
				DispatchInstructionDeliveryOutcome,
				{ readonly status: "ready" }
			>["locator"];
			readonly attachedPlan: AttachedPlanEvidence;
			readonly anchorPr: DispatchAnchorPr;
			readonly runId: string;
			readonly workflowRunUrl: string;
	  }
	| DeliveryFailure
	| { readonly status: "dirty-tree"; readonly dirtyPaths: readonly string[] }
	| { readonly status: "preflight-failed"; readonly checks: readonly DispatchPreflightCheck[] }
	| { readonly status: "plan-resolution-failed"; readonly reason: string; readonly message: string }
	| {
			readonly status: "setup-required" | "brmem-preflight-failed";
			readonly dispatchId: string;
			readonly remote: string;
			readonly message: string;
			readonly artifacts: readonly [];
			readonly setupCommand?: string;
	  }
	| { readonly status: "source-unusable"; readonly code: string; readonly message: string }
	| {
			readonly status:
				| "source-push-failed"
				| "source-publication-plan-failed"
				| "graphite-publication-failed"
				| "source-publication-verification-failed"
				| "source-revalidation-failed"
				| "anchor-branch-availability-failed"
				| "anchor-branch-unavailable";
			readonly message: string;
			readonly sourceBranch?: string;
	  }
	| {
			readonly status: "source-publication-force-required" | "source-publication-declined";
			readonly message: string;
			readonly affectedBranches: readonly string[];
	  }
	| {
			readonly status: "invalid-dispatch-context";
			readonly dispatchId: string;
			readonly message: string;
	  }
	| {
			readonly status: "attached-plan-conflict";
			readonly dispatchId: string;
			readonly branch: string;
			readonly key: string;
			readonly anchorPr: DispatchAnchorPr;
	  }
	| {
			readonly status: "attached-plan-publication-failed";
			readonly dispatchId: string;
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
			readonly attachedPlan: AttachedPlanEvidence;
	  }
	| {
			readonly status: "anchor-push-failed" | "anchor-pr-failed";
			readonly dispatchId: string;
			readonly anchorBranch: string;
			readonly message: string;
			readonly artifacts: readonly DispatchInstructionDurableArtifact[];
	  }
	| {
			readonly status: "trigger-failed" | "run-id-stamp-failed";
			readonly dispatchId: string;
			readonly message: string;
			readonly code?: string;
			readonly anchorPr: DispatchAnchorPr;
			readonly runId?: string;
			readonly artifacts: readonly DispatchInstructionDurableArtifact[];
	  };

export async function executeDispatchPlan(
	request: DispatchPlanRequest,
	gateways: DispatchPlanGateways,
): Promise<DispatchPlanOutcome> {
	const sourceResult = await resolveDispatchSource({ cwd: request.cwd }, gateways);
	if (sourceResult.status !== "ready") return sourceResult;
	const initialSource = sourceResult.source;
	const preflight = await runDispatchPreflight({ repoRoot: initialSource.repoRoot }, gateways);
	if (!preflight.ok) return { status: "preflight-failed", checks: preflight.checks };
	const preparation = await prepareDispatchPlan(request, gateways);
	if (preparation.status !== "ready") return preparation;
	const brmemPreflight = await preflightDispatchBrmemSetup(gateways.brmem);
	if (brmemPreflight.status !== "ready") {
		return { ...brmemPreflight, dispatchId: preparation.dispatchId, artifacts: [] };
	}
	const remoteTip = await gateways.git.readRemoteBranchTip({
		cwd: request.cwd,
		branch: initialSource.branch,
	});
	if (remoteTip.type === "error") {
		return { status: "source-unusable", code: "git-read-failed", message: remoteTip.error.message };
	}
	const preparedSource = await prepareDispatchSource({
		cwd: request.cwd,
		initialSource,
		initialRemoteTip: remoteTip,
		force: false,
		...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
		gateways,
	});
	if (!preparedSource.ok) {
		const outcome = preparedSource.outcome;
		switch (outcome.status) {
			case "source-publication-force-required":
			case "source-publication-declined":
				return { ...outcome, message: "Source publication was not authorized." };
			case "source-push-failed":
			case "source-publication-plan-failed":
			case "graphite-publication-failed":
			case "source-publication-verification-failed":
			case "source-revalidation-failed":
				return { ...outcome, message: outcome.message };
			default:
				throw new Error("Source preparation returned an impossible outcome.");
		}
	}
	const source = preparedSource.prepared.context.source;
	const finalPreflight = preparedSource.prepared.context.preflight;
	const slugResult = await gateways.semanticSlugs.deriveSemanticSlug({
		kind: "plan",
		content: preparation.plan.content,
		cwd: request.cwd,
	});
	if (!slugResult.ok) {
		return {
			status: "source-unusable",
			code: "plan-slug-generation-failed",
			message: slugResult.error.message,
		};
	}
	const timestamp = formatDispatchAnchorTimestamp(
		gateways.clock.nowMs(),
		finalPreflight.anchorTimeZone,
	);
	let anchorBranch: string | undefined;
	for (const candidate of buildDispatchAnchorNameCandidates(slugResult.slug, timestamp)) {
		const availability = await gateways.git.isAnchorBranchNameAvailable({
			cwd: request.cwd,
			anchorBranch: candidate.name,
		});
		if (availability.type === "available") {
			anchorBranch = candidate.name;
			break;
		}
		if (availability.type === "error")
			return { status: "anchor-branch-availability-failed", message: availability.error.message };
	}
	if (anchorBranch === undefined)
		return {
			status: "anchor-branch-unavailable",
			message: "No dispatch anchor branch name is available.",
		};
	const anchor = await createDispatchAnchor(
		{
			cwd: request.cwd,
			revision: source.headSha,
			anchorBranch,
			baseBranch: source.branch,
			title: buildAnchorPrTitle(`Execute Saved Plan: ${preparation.plan.slug}`),
			body: `This pull request anchors \`ns dispatch plan\` for ${preparation.plan.slug}.\n\nDispatch ID: \`${preparation.dispatchId}\`.`,
		},
		gateways,
	);
	if (anchor.status !== "ready")
		return { ...anchor, dispatchId: preparation.dispatchId, artifacts: [] };

	const attached = await ensureAttachedPlan({
		brmem: gateways.brmem,
		branch: anchor.anchorPr.branch,
		key: buildBranchContextPlanKey(preparation.plan.slug),
		content: preparation.plan.content,
		sourceFile: preparation.plan.filePath,
	});
	if (attached.type === "conflict") {
		return {
			status: "attached-plan-conflict",
			dispatchId: preparation.dispatchId,
			branch: attached.branch,
			key: attached.key,
			anchorPr: anchor.anchorPr,
		};
	}
	const attachmentPublished = await gateways.snapshots.publishSnapshot({
		cwd: request.cwd,
		remote: brmemPreflight.remote,
		snapshotRef: attached.snapshotRef,
		commitSha: attached.commit,
	});
	if (!attachmentPublished.ok) {
		return {
			status: "attached-plan-publication-failed",
			dispatchId: preparation.dispatchId,
			message: attachmentPublished.error.message,
			anchorPr: anchor.anchorPr,
			attachedPlan: attached,
		};
	}
	const remoteAttachment = await gateways.snapshots.readRemoteSnapshotTip({
		cwd: request.cwd,
		remote: brmemPreflight.remote,
		snapshotRef: attached.snapshotRef,
	});
	if (
		remoteAttachment.type !== "found" ||
		remoteAttachment.commitSha.toLowerCase() !== attached.commit.toLowerCase()
	) {
		const detail =
			remoteAttachment.type === "error"
				? remoteAttachment.error.message
				: "The published Attached Plan Snapshot Ref did not resolve to its pinned commit.";
		return {
			status: "attached-plan-publication-failed",
			dispatchId: preparation.dispatchId,
			message: detail,
			anchorPr: anchor.anchorPr,
			attachedPlan: attached,
		};
	}
	const instructionContent = [
		"Implement the exact Attached Plan identified below.",
		"",
		`Branch: ${attached.branch}`,
		`Key: ${attached.key}`,
		`Pinned commit: ${attached.commit}`,
		`Entry Locator: ${attached.entryLocator}`,
		"",
		"Load it through the established Branch Context implementation path at that pinned commit, then follow it exactly.",
	].join("\n");
	const run = await deliverInstructionsAndStartRun({
		cwd: request.cwd,
		revision: source.headSha,
		dispatchId: preparation.dispatchId,
		anchorPr: anchor.anchorPr,
		instructionContent,
		remote: brmemPreflight.remote,
		connection: finalPreflight.triggerConnection,
		workflowDashboardUrl: finalPreflight.workflowDashboardUrl,
		brmem: gateways.brmem,
		snapshots: gateways.snapshots,
		workflowGateways: gateways,
		...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
	});
	if (run.status !== "ready") {
		if (run.status === "trigger-failed" || run.status === "run-id-stamp-failed") {
			return { ...run, dispatchId: preparation.dispatchId, artifacts: run.delivery.artifacts };
		}
		return run;
	}
	void buildPlanAnchorPrBody;
	return {
		status: "dispatched",
		dispatchId: preparation.dispatchId,
		revision: source.headSha,
		sourceBranch: source.branch,
		isSourcePushed: preparedSource.prepared.receipt.source.type !== "already-current",
		locator: run.delivery.locator,
		attachedPlan: attached,
		anchorPr: anchor.anchorPr,
		runId: run.runId,
		workflowRunUrl: run.workflowRunUrl,
	};
}
