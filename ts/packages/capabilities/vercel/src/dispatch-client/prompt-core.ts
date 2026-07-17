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
import type {
	DispatchGraphitePublicationStage,
	DispatchPromptGateways,
	DispatchSourcePublicationMutationEvidence,
} from "./contracts.ts";
import {
	createDispatchAnchor,
	resolveDispatchSource,
	startDispatchWorkflow,
	type DispatchAnchorPr,
} from "./core.ts";
import { runDispatchPreflight, type DispatchPreflightCheck } from "./preflight.ts";
import {
	prepareDispatchSource,
	type CompletedDispatchSourcePublication,
	type DispatchSourcePublication,
	type PreparedDispatchSource,
} from "./source-preparation.ts";

export { runDispatchPreflight } from "./preflight.ts";
export type { DispatchPreflightCheck } from "./preflight.ts";

export interface DispatchPromptRequest {
	readonly cwd: string;
	readonly prompt: string;
	readonly slugOverride?: string;
	readonly force: boolean;
	readonly onPhase?: (message: string) => void;
}

type DispatchSourceRevalidationReason =
	| "source-read-failed"
	| "repository-drift"
	| "branch-drift"
	| "head-drift"
	| "dirty-read-failed"
	| "dirty-tree"
	| "preflight-failed"
	| "remote-tip-read-failed"
	| "remote-tip-mismatch";

type DispatchFailureWithCompletedPublication<T> = T &
	(
		| CompletedDispatchSourcePublication
		| {
				readonly sourcePublication?: never;
				readonly mutation?: never;
				readonly affectedBranches?: never;
		  }
	);

export type DispatchPromptOutcome =
	| {
			readonly status: "dispatched";
			readonly revision: string;
			readonly sourceBranch: string;
			readonly sourcePublication: DispatchSourcePublication;
			readonly isSourcePushed: boolean;
			readonly anchorPr: DispatchAnchorPr;
			readonly runId: string;
			readonly workflowRunUrl: string;
	  }
	| { readonly status: "dirty-tree"; readonly dirtyPaths: readonly string[] }
	| { readonly status: "preflight-failed"; readonly checks: readonly DispatchPreflightCheck[] }
	| { readonly status: "invalid-branch-slug-override"; readonly message: string }
	| { readonly status: "branch-slug-generation-failed"; readonly message: string }
	| DispatchFailureWithCompletedPublication<{
			readonly status: "anchor-branch-availability-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  }>
	| DispatchFailureWithCompletedPublication<{
			readonly status: "anchor-branch-unavailable";
			readonly semanticSlug: string;
			readonly candidateLimit: number;
	  }>
	| {
			readonly status: "source-unusable";
			readonly code: "not-a-repository" | "detached-head" | "git-read-failed";
			readonly message: string;
	  }
	| {
			readonly status: "source-publication-plan-failed";
			readonly code: string;
			readonly message: string;
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| {
			readonly status: "source-publication-force-required";
			readonly affectedBranches: readonly string[];
	  }
	| {
			readonly status: "source-publication-declined";
			readonly affectedBranches: readonly string[];
	  }
	| {
			readonly status: "source-push-failed";
			readonly sourceBranch: string;
			readonly message: string;
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| {
			readonly status: "graphite-publication-failed";
			readonly stage: DispatchGraphitePublicationStage;
			readonly code: string;
			readonly message: string;
			readonly affectedBranches: readonly string[];
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| (CompletedDispatchSourcePublication & {
			readonly status: "source-publication-verification-failed";
			readonly reason: DispatchSourceRevalidationReason;
			readonly message: string;
			readonly checks?: readonly DispatchPreflightCheck[];
			readonly dirtyPaths?: readonly string[];
	  })
	| {
			readonly status: "source-revalidation-failed";
			readonly reason: DispatchSourceRevalidationReason;
			readonly message: string;
			readonly checks?: readonly DispatchPreflightCheck[];
			readonly dirtyPaths?: readonly string[];
	  }
	| DispatchFailureWithCompletedPublication<{
			readonly status: "anchor-push-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  }>
	| DispatchFailureWithCompletedPublication<{
			readonly status: "anchor-pr-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  }>
	| DispatchFailureWithCompletedPublication<{
			readonly status: "trigger-failed";
			readonly code: string;
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
	  }>
	| DispatchFailureWithCompletedPublication<{
			readonly status: "run-id-stamp-failed";
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
			/** Absent only when the returned run id itself was unusable. */
			readonly runId?: string;
	  }>;

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
		initialPreflight,
		initialRemoteTip: remoteTip,
		force: request.force,
		...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
		gateways,
	});
	if (preparedResult.ok === false) return preparedResult.outcome;
	const prepared = preparedResult.prepared;
	const finalSource = prepared.context.source;
	const finalPreflight = prepared.context.preflight;
	const completedPublication = publicationEvidence(prepared);

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
				...(completedPublication === undefined ? {} : completedPublication),
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
			...(completedPublication === undefined ? {} : completedPublication),
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
	if (anchor.status !== "ready") {
		return completedPublication === undefined ? anchor : { ...anchor, ...completedPublication };
	}

	const workflow = await startDispatchWorkflow(
		{
			cwd: request.cwd,
			input: {
				revision: finalSource.headSha,
				anchorBranch: anchor.anchorPr.branch,
				anchorPrNumber: anchor.anchorPr.number,
				prompt: request.prompt,
			},
			anchorPr: anchor.anchorPr,
			connection: finalPreflight.triggerConnection,
			workflowDashboardUrl: finalPreflight.workflowDashboardUrl,
			...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
		},
		gateways,
	);
	if (workflow.status !== "ready") {
		return completedPublication === undefined ? workflow : { ...workflow, ...completedPublication };
	}

	return {
		status: "dispatched",
		revision: workflow.runInput.revision,
		sourceBranch: finalSource.branch,
		sourcePublication: prepared.type,
		isSourcePushed: prepared.type !== "already-current",
		anchorPr: anchor.anchorPr,
		runId: workflow.runId,
		workflowRunUrl: workflow.workflowRunUrl,
	};
}

function publicationEvidence(
	prepared: PreparedDispatchSource,
): CompletedDispatchSourcePublication | undefined {
	return prepared.type === "already-current" ? undefined : prepared.completedPublication;
}
