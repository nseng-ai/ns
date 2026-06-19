import { z } from "zod";

import { failure, negative, ok, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";
import type { GithubPrFeedbackGateway, GithubPrSummary } from "@asdl/core/github-pr-feedback";
import { duplicateValues } from "./duplicate-values.ts";
import {
	defineExecOperation,
	gatewayOptions,
	prFeedbackFailureExit,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import { loadJsonInput } from "./json-input.ts";
import { mapBranchPrsResultSchema } from "./operation-schemas/collection.ts";

export const mapBranchPrsInputSchema = z.looseObject({
	branches: z.array(z.string()),
});

const mapBranchPrsParseSchema = z.object({
	branchesJson: z.string().optional(),
});

type MapBranchPrsRequest = z.output<typeof mapBranchPrsParseSchema>;

export interface BranchPrEntry {
	branch: string;
	pr_number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
}

export interface AmbiguousBranchPrEntry {
	branch: string;
	candidates: BranchPrEntry[];
}

export interface MapBranchPrsResult {
	branch_prs: BranchPrEntry[];
	missing_branches: string[];
	ambiguous_branches: AmbiguousBranchPrEntry[];
	summary: { requested: number; matched: number; missing: number; ambiguous: number };
}

export const mapBranchPrsOperation = defineExecOperation({
	isRepoContextRequired: true,
	resultSchema: mapBranchPrsResultSchema,
	spec: {
		name: "map-branch-prs",
		description: "Map local branches to open PRs.",
		schema: mapBranchPrsParseSchema,
		handler: runMapBranchPrsOperation,
	},
});

async function runMapBranchPrsOperation(
	ctx: PrAddressExecContext,
	request: MapBranchPrsRequest,
): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.branchesJson,
		commandName: "map-branch-prs",
		inputDescription: "branches JSON payload",
		optionName: "--branches-json",
		schema: mapBranchPrsInputSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error")
		return failure(payloadResult.error.errorType, payloadResult.error.message);

	const branches = payloadResult.value.branches;
	const validationMessage = branchesValidationMessage(branches, "map-branch-prs");
	if (validationMessage !== null) return failure("invalid_request", validationMessage);

	const mapping = await mapBranchesToOpenPrs({ branches, prFeedback: ctx.context.prFeedback, ctx });
	if (mapping.type === "error") return mapping.exit;
	const result = mapping.value;
	if (result.missing_branches.length === 0 && result.ambiguous_branches.length === 0)
		return ok(result);
	return negative(mappingFailureMessage(result), result);
}

export async function mapBranchesToOpenPrs(options: {
	branches: readonly string[];
	prFeedback: GithubPrFeedbackGateway;
	ctx: PrAddressExecContext;
}): Promise<
	{ type: "ok"; value: MapBranchPrsResult } | { type: "error"; exit: ClinkrFailureExit }
> {
	const openPrsResult = await options.prFeedback.listOpenPrs(gatewayOptions(options.ctx));
	if (!openPrsResult.ok)
		return {
			type: "error",
			exit: prFeedbackFailureExit("Failed to list open PRs", openPrsResult.error),
		};

	const prsByHeadBranch = prsGroupedByHeadBranch(openPrsResult.value);
	const branchPrs: BranchPrEntry[] = [];
	const missingBranches: string[] = [];
	const ambiguousBranches: AmbiguousBranchPrEntry[] = [];
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
		const [pr] = candidates;
		if (pr === undefined) throw new Error(`Expected PR candidate for branch ${branch}.`);
		branchPrs.push(branchPrEntry(branch, pr));
	}
	return {
		type: "ok",
		value: {
			branch_prs: branchPrs,
			missing_branches: missingBranches,
			ambiguous_branches: ambiguousBranches,
			summary: {
				requested: options.branches.length,
				matched: branchPrs.length,
				missing: missingBranches.length,
				ambiguous: ambiguousBranches.length,
			},
		},
	};
}

export function branchesValidationMessage(
	branches: readonly string[],
	commandName: string,
): string | null {
	if (branches.length === 0) return `${commandName} requires at least one branch.`;
	if (!branches.every((branch) => branch.trim() !== ""))
		return `${commandName} requires every branch to be non-empty.`;
	const duplicates = duplicateValues(branches);
	if (duplicates.length > 0)
		return `${commandName} branches contain duplicates: ${duplicates.join(", ")}`;
	return null;
}

function branchPrEntry(branch: string, pr: GithubPrSummary): BranchPrEntry {
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

function mappingFailureMessage(result: MapBranchPrsResult): string {
	const ambiguousBranchNames = result.ambiguous_branches.map((entry) => entry.branch);
	if (result.missing_branches.length > 0 && ambiguousBranchNames.length > 0) {
		return `Could not map branches uniquely; missing: ${result.missing_branches.join(", ")}; ambiguous: ${ambiguousBranchNames.join(", ")}`;
	}
	if (ambiguousBranchNames.length > 0)
		return `Multiple open PRs found for branches: ${ambiguousBranchNames.join(", ")}`;
	return `No open PR found for branches: ${result.missing_branches.join(", ")}`;
}
