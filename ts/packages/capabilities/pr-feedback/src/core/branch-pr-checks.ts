import type {
	GithubBranchPrChecksOutcome,
	GithubPrFeedbackFailure,
	PrFeedbackGithubGateway,
} from "../api.ts";

import {
	branchPrEntry,
	branchPrMappingSummary,
	type BranchPrMappingEntry,
	type BranchPrMappingSummary,
} from "./branch-pr-mapping.ts";
import type { GatewayOptions } from "./gateways.ts";
import {
	statusChecksPayload,
	type PrCheckEntryPayload,
	type PrChecksCountsPayload,
} from "./pr-checks.ts";
import { buildPrChecksTargetPayload, type PrTargetPayload } from "./pr-target-payload.ts";

export interface BranchPrChecksFoundEntry {
	branch: string;
	status: "found";
	target: PrTargetPayload;
	counts: PrChecksCountsPayload;
	checks: PrCheckEntryPayload[];
}

export interface BranchPrChecksMissingEntry {
	branch: string;
	status: "missing";
}

export interface BranchPrChecksAmbiguousEntry {
	branch: string;
	status: "ambiguous";
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
	prFeedback: PrFeedbackGithubGateway;
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

function branchPrChecksEntry(outcome: GithubBranchPrChecksOutcome): BranchPrChecksEntry {
	switch (outcome.type) {
		case "found":
			return {
				branch: outcome.branch,
				status: "found",
				target: buildPrChecksTargetPayload({ pr: outcome.pr, branch: outcome.branch }),
				...statusChecksPayload(outcome.checks),
			};
		case "missing":
			return { branch: outcome.branch, status: "missing" };
		case "ambiguous":
			return {
				branch: outcome.branch,
				status: "ambiguous",
				candidates: outcome.candidates.map((pr) => branchPrEntry(outcome.branch, pr)),
			};
	}
}
