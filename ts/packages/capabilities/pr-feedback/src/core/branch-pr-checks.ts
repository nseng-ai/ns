import type {
	GithubBranchPrChecksOutcome,
	GithubPrFeedbackFailure,
	PrAddressGithubGateway,
} from "../api.ts";

import {
	branchPrEntry,
	branchPrMappingSummary,
	type BranchPrMappingEntry,
	type BranchPrMappingGaps,
	type BranchPrMappingSummary,
} from "./branch-pr-mapping.ts";
import type { GatewayOptions } from "./gateways.ts";
import {
	statusChecksPayload,
	type PrCheckEntryPayload,
	type PrChecksCountsPayload,
} from "./pr-checks.ts";
import { buildPrChecksTargetPayload, type PrTargetPayload } from "./pr-target-payload.ts";

export type BranchPrCheckFreshness = "fresh" | "stale" | "unknown";
export type BranchPrStatus = "draft" | "checks-failing" | "unresolved" | "ready";

export interface BranchPrCheckEntry extends PrCheckEntryPayload {
	freshness: BranchPrCheckFreshness;
	is_trailing: boolean;
}

export interface BranchPrChecksFoundEntry {
	branch: string;
	status: "found";
	pr_status: BranchPrStatus;
	target: PrTargetPayload;
	head_commit_committed_at: string | null;
	review_threads: { total: number; resolved: number; unresolved: number };
	counts: PrChecksCountsPayload;
	checks: BranchPrCheckEntry[];
}

export interface BranchPrChecksMissingEntry {
	branch: string;
	status: "missing";
	pr_status: "no-pr";
}

export interface BranchPrChecksAmbiguousEntry {
	branch: string;
	status: "ambiguous";
	pr_status: null;
	candidates: BranchPrMappingEntry[];
}

export type BranchPrChecksEntry =
	| BranchPrChecksFoundEntry
	| BranchPrChecksMissingEntry
	| BranchPrChecksAmbiguousEntry;

export interface BranchPrChecksCollection {
	entries: BranchPrChecksEntry[];
	summary: BranchPrMappingSummary;
}

export type BranchPrChecksResult =
	| { type: "ok"; collection: BranchPrChecksCollection }
	| { type: "failure"; message: string; failure: GithubPrFeedbackFailure };

export interface CollectBranchPrChecksOptions {
	branches: readonly string[];
	prFeedback: PrAddressGithubGateway;
	gatewayOptions: GatewayOptions;
}

export async function collectBranchPrChecks(
	options: CollectBranchPrChecksOptions,
): Promise<BranchPrChecksResult> {
	const outcomes = await options.prFeedback.getBranchPrChecks({
		...options.gatewayOptions,
		branches: options.branches,
	});
	if (!outcomes.ok) {
		return {
			type: "failure",
			message: "Failed to fetch branch PR checks",
			failure: outcomes.error,
		};
	}
	const partialOutcome = outcomes.value.find(
		(outcome) => outcome.type === "found" && outcome.checks.counts.hasMore,
	);
	if (partialOutcome?.type === "found") {
		return {
			type: "failure",
			message: "Failed to fetch complete branch PR checks",
			failure: {
				code: "github_pr_feedback_response_invalid",
				message: `GitHub branch PR checks for branch ${partialOutcome.branch} (PR ${partialOutcome.pr.number}) have incomplete check pagination.`,
				details: { operation: "getBranchPrChecks", prNumber: partialOutcome.pr.number },
			},
		};
	}
	const entries = outcomes.value.map(branchPrChecksEntry);
	return {
		type: "ok",
		collection: {
			entries,
			summary: branchPrMappingSummary({
				requested: options.branches.length,
				matched: entries.filter((entry) => entry.status === "found").length,
				missing: entries.filter((entry) => entry.status === "missing").length,
				ambiguous: entries.filter((entry) => entry.status === "ambiguous").length,
			}),
		},
	};
}

export function branchPrChecksMappingGaps(
	collection: BranchPrChecksCollection,
): BranchPrMappingGaps {
	return {
		missingBranches: collection.entries
			.filter((entry) => entry.status === "missing")
			.map((entry) => entry.branch),
		ambiguousBranchNames: collection.entries
			.filter((entry) => entry.status === "ambiguous")
			.map((entry) => entry.branch),
	};
}

function branchPrChecksEntry(outcome: GithubBranchPrChecksOutcome): BranchPrChecksEntry {
	switch (outcome.type) {
		case "found": {
			const payload = statusChecksPayload(outcome.checks);
			const checks = payload.checks.map((check) =>
				enrichBranchCheck(check, outcome.headCommitCommittedAt),
			);
			const resolved = outcome.reviewThreads.filter((thread) => thread.isResolved).length;
			const reviewThreads = {
				total: outcome.reviewThreads.length,
				resolved,
				unresolved: outcome.reviewThreads.length - resolved,
			};
			return {
				branch: outcome.branch,
				status: "found",
				pr_status: deriveFoundPrStatus(outcome.isDraft, checks, reviewThreads.unresolved),
				target: buildPrChecksTargetPayload({ pr: outcome.pr, branch: outcome.branch }),
				head_commit_committed_at: outcome.headCommitCommittedAt,
				review_threads: reviewThreads,
				counts: payload.counts,
				checks,
			};
		}
		case "missing":
			return { branch: outcome.branch, status: "missing", pr_status: "no-pr" };
		case "ambiguous":
			return {
				branch: outcome.branch,
				status: "ambiguous",
				pr_status: null,
				candidates: outcome.candidates.map((pr) => branchPrEntry(outcome.branch, pr)),
			};
	}
}

function enrichBranchCheck(
	check: PrCheckEntryPayload,
	headCommitCommittedAt: string | null,
): BranchPrCheckEntry {
	return {
		...check,
		freshness: checkFreshness(check, headCommitCommittedAt),
		is_trailing:
			check.bucket === "pending" &&
			(check.identity === "status-context:Graphite / mergeability_check" ||
				(check.identity === null && check.name === "Graphite / mergeability_check")),
	};
}

function checkFreshness(
	check: PrCheckEntryPayload,
	headCommitCommittedAt: string | null,
): BranchPrCheckFreshness {
	const checkTimestamp =
		check.kind === "check_run" ? (check.started_at ?? check.created_at) : check.created_at;
	const checkMs = checkTimestamp === null ? Number.NaN : Date.parse(checkTimestamp);
	const commitMs = headCommitCommittedAt === null ? Number.NaN : Date.parse(headCommitCommittedAt);
	if (!Number.isFinite(checkMs) || !Number.isFinite(commitMs)) return "unknown";
	return checkMs < commitMs ? "stale" : "fresh";
}

function deriveFoundPrStatus(
	isDraft: boolean,
	checks: readonly BranchPrCheckEntry[],
	unresolvedThreads: number,
): BranchPrStatus {
	if (isDraft) return "draft";
	if (checks.some((check) => check.bucket === "failing" && check.freshness !== "stale"))
		return "checks-failing";
	if (unresolvedThreads > 0) return "unresolved";
	return "ready";
}
