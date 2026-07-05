import type { GithubPrFeedbackFailure, GithubPrFeedbackGateway, GithubPrSummary } from "../api.ts";

import type { GatewayOptions } from "./gateways.ts";

export interface BranchPrMappingEntry {
	branch: string;
	pr_number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
}

export interface AmbiguousBranchPrMappingEntry {
	branch: string;
	candidates: BranchPrMappingEntry[];
}

export interface BranchPrMapping {
	branchPrs: BranchPrMappingEntry[];
	missingBranches: string[];
	ambiguousBranches: AmbiguousBranchPrMappingEntry[];
	summary: {
		requested: number;
		matched: number;
		missing: number;
		ambiguous: number;
	};
}

export type BranchPrMappingResult =
	| { type: "ok"; mapping: BranchPrMapping }
	| { type: "failure"; message: string; failure: GithubPrFeedbackFailure };

export interface MapBranchesToOpenPrsOptions {
	branches: readonly string[];
	prFeedback: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
}

export async function mapBranchesToOpenPrs(
	options: MapBranchesToOpenPrsOptions,
): Promise<BranchPrMappingResult> {
	const openPrsResult = await options.prFeedback.listOpenPrs(options.gatewayOptions);
	if (!openPrsResult.ok) return mappingFailure("Failed to list open PRs", openPrsResult.error);

	const prsByHeadBranch = prsGroupedByHeadBranch(openPrsResult.value);
	const branchPrs: BranchPrMappingEntry[] = [];
	const missingBranches: string[] = [];
	const ambiguousBranches: AmbiguousBranchPrMappingEntry[] = [];
	for (const branch of options.branches) {
		const candidates = prsByHeadBranch.get(branch) ?? [];
		if (candidates.length === 0) {
			missingBranches.push(branch);
			continue;
		}
		if (candidates.length > 1) {
			ambiguousBranches.push({
				branch,
				candidates: candidates.map((pr) => branchPrEntry(branch, pr)),
			});
			continue;
		}
		const pr = candidates[0];
		if (pr === undefined) {
			throw new Error(
				`Expected exactly one PR candidate for branch ${branch}, but none was available after singleton validation.`,
			);
		}
		branchPrs.push(branchPrEntry(branch, pr));
	}
	return {
		type: "ok",
		mapping: {
			branchPrs: branchPrs,
			missingBranches: missingBranches,
			ambiguousBranches: ambiguousBranches,
			summary: {
				requested: options.branches.length,
				matched: branchPrs.length,
				missing: missingBranches.length,
				ambiguous: ambiguousBranches.length,
			},
		},
	};
}

function mappingFailure(message: string, failure: GithubPrFeedbackFailure): BranchPrMappingResult {
	return { type: "failure", message, failure };
}

export function branchPrEntry(branch: string, pr: GithubPrSummary): BranchPrMappingEntry {
	return {
		branch,
		pr_number: pr.number,
		title: pr.title,
		url: pr.url,
		head_ref_name: pr.headRefName,
		base_ref_name: pr.baseRefName,
	};
}

function prsGroupedByHeadBranch(
	prs: readonly GithubPrSummary[],
): ReadonlyMap<string, readonly GithubPrSummary[]> {
	const byBranch = new Map<string, GithubPrSummary[]>();
	for (const pr of prs) {
		const existing = byBranch.get(pr.headRefName) ?? [];
		existing.push(pr);
		byBranch.set(pr.headRefName, existing);
	}
	return byBranch;
}
