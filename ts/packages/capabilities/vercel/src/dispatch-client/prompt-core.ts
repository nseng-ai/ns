// The `ns dispatch prompt` command core (steel-thread sub-slice 3): pure
// orchestration over the gateway seams in `contracts.ts`. Order of
// operations mirrors the README's contract — local git refusals first
// (clean-tree rule with the dirty-file list), then the credentials
// preflight (README "Setup": report exactly what is missing before any
// remote work starts), then semantic slug preparation, exact-source
// publication (Git push or Graphite submit) and revalidation, timestamped
// anchor-name selection, the up-front `dispatch/` anchor branch and PR on
// the user's own credentials, the authenticated trigger call, and the
// run-id stamp on the anchor PR. Live behavior against the deployed trigger
// route is pending verification; tests drive this core with in-memory fakes.
import {
	buildDispatchAnchorNameCandidates,
	DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT,
	formatDispatchAnchorTimestamp,
} from "./anchor-name.ts";
import { buildAnchorPrBody, buildAnchorPrTitle } from "./content.ts";
import { normalizeDispatchSlugOverride } from "./content-slug.ts";
import type { DispatchPromptGateways } from "./contracts.ts";
import { createDispatchAnchor, resolveDispatchSource, startDispatchWorkflow } from "./core.ts";
import type { DispatchPromptOutcome } from "./outcome.ts";
import { runDispatchPreflight } from "./preflight.ts";
import { prepareDispatchSource } from "./source-preparation.ts";

export { runDispatchPreflight } from "./preflight.ts";
export type { DispatchPreflightCheck } from "./preflight.ts";

export interface DispatchPromptRequest {
	readonly cwd: string;
	readonly prompt: string;
	readonly slugOverride?: string;
	readonly force: boolean;
	readonly onPhase?: (message: string) => void;
}

/**
 * Execute one prompt dispatch end-to-end on the local side. Mutations
 * start only after every refusal/preflight gate passes; each failure
 * after a mutation reports what already exists (the pushed branch, the
 * open PR, the started run) so nothing is orphaned silently.
 */
export async function executeDispatchPrompt(
	request: DispatchPromptRequest,
	gateways: DispatchPromptGateways,
): Promise<DispatchPromptOutcome> {
	request.onPhase?.("Checking the source branch and worktree…");
	const sourceResult = await resolveDispatchSource({ cwd: request.cwd }, gateways);
	if (sourceResult.status !== "ready") return sourceResult;
	const initialSource = sourceResult.source;

	request.onPhase?.("Validating dispatch configuration and identity…");
	const initialPreflight = await runDispatchPreflight(
		{ repoRoot: initialSource.repoRoot },
		gateways,
	);
	if (initialPreflight.ok === false) {
		return { status: "preflight-failed", checks: initialPreflight.checks };
	}

	request.onPhase?.("Checking whether the source revision is already published…");
	const remoteTip = await gateways.git.readRemoteBranchTip({
		cwd: request.cwd,
		branch: initialSource.branch,
	});
	if (remoteTip.type === "error") {
		return { status: "source-unusable", code: "git-read-failed", message: remoteTip.error.message };
	}

	request.onPhase?.("Deriving the semantic anchor branch name…");
	const semanticSlugOverride =
		request.slugOverride === undefined
			? undefined
			: normalizeDispatchSlugOverride(request.slugOverride);
	if (request.slugOverride !== undefined && semanticSlugOverride === undefined) {
		return {
			status: "invalid-branch-slug-override",
			message:
				"The dispatch slug override must contain at least one ASCII letter or digit after normalization.",
		};
	}
	let semanticSlug = semanticSlugOverride;
	if (semanticSlug === undefined) {
		const derived = await gateways.semanticSlugs.deriveSemanticSlug({
			kind: "prompt",
			content: request.prompt,
			cwd: request.cwd,
		});
		if (derived.ok === false) {
			return { status: "branch-slug-generation-failed", message: derived.error.message };
		}
		semanticSlug = derived.slug;
	}

	const preparedResult = await prepareDispatchSource({
		cwd: request.cwd,
		initialSource,
		initialRemoteTip: remoteTip,
		force: request.force,
		...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
		gateways,
	});
	if (preparedResult.ok === false) return preparedResult.outcome;
	const prepared = preparedResult.prepared;
	const finalSource = prepared.context.source;
	const finalPreflight = prepared.context.preflight;
	const sourceReceipt = prepared.receipt;

	const timestamp = formatDispatchAnchorTimestamp(
		gateways.clock.nowMs(),
		finalPreflight.anchorTimeZone,
	);
	let anchorBranch: string | undefined;
	for (const candidate of buildDispatchAnchorNameCandidates(semanticSlug, timestamp)) {
		const availability = await gateways.git.isAnchorBranchNameAvailable({
			cwd: request.cwd,
			anchorBranch: candidate.name,
		});
		if (availability.type === "error") {
			return {
				status: "anchor-branch-availability-failed",
				anchorBranch: candidate.name,
				message: availability.error.message,
				receipt: sourceReceipt,
			};
		}
		if (availability.type === "available") {
			anchorBranch = candidate.name;
			break;
		}
	}
	if (anchorBranch === undefined) {
		return {
			status: "anchor-branch-unavailable",
			semanticSlug,
			candidateLimit: DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT,
			receipt: sourceReceipt,
		};
	}

	request.onPhase?.("Creating the anchor branch and pull request…");
	const anchor = await createDispatchAnchor(
		{
			cwd: request.cwd,
			revision: finalSource.headSha,
			anchorBranch,
			baseBranch: finalSource.branch,
			title: buildAnchorPrTitle(request.prompt),
			body: buildAnchorPrBody({
				prompt: request.prompt,
				revision: finalSource.headSha,
				sourceBranch: finalSource.branch,
			}),
		},
		gateways,
	);
	if (anchor.status === "anchor-push-failed") {
		return {
			status: "anchor-push-failed",
			anchorBranch: anchor.anchorBranch,
			message: anchor.message,
			receipt: sourceReceipt,
		};
	}
	if (anchor.status === "anchor-pr-failed") {
		return {
			status: "anchor-pr-failed",
			message: anchor.message,
			receipt: {
				stage: "anchor-pushed",
				source: sourceReceipt.source,
				anchorBranch: anchor.anchorBranch,
			},
		};
	}
	const anchorPr = anchor.anchorPr;
	const prReceipt = {
		stage: "pr-opened" as const,
		source: sourceReceipt.source,
		anchorPr,
	};

	const workflow = await startDispatchWorkflow(
		{
			cwd: request.cwd,
			input: {
				revision: finalSource.headSha,
				anchorBranch: anchorPr.branch,
				anchorPrNumber: anchorPr.number,
				prompt: request.prompt,
			},
			anchorPr,
			connection: finalPreflight.triggerConnection,
			workflowDashboardUrl: finalPreflight.workflowDashboardUrl,
			...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
		},
		gateways,
	);
	if (workflow.status === "trigger-failed") {
		return {
			status: "trigger-failed",
			code: workflow.code,
			message: workflow.message,
			receipt: prReceipt,
		};
	}
	if (workflow.status === "run-id-stamp-failed") {
		return {
			status: "run-id-stamp-failed",
			message: workflow.message,
			receipt:
				workflow.runId === undefined
					? prReceipt
					: {
							stage: "run-started",
							source: sourceReceipt.source,
							anchorPr,
							runId: workflow.runId,
						},
		};
	}

	return {
		status: "dispatched",
		revision: workflow.runInput.revision,
		sourceBranch: finalSource.branch,
		workflowRunUrl: workflow.workflowRunUrl,
		receipt: {
			stage: "run-started",
			source: sourceReceipt.source,
			anchorPr,
			runId: workflow.runId,
		},
	};
}
