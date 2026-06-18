import { z } from "zod";

import { failure, negative, ok, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";
import { duplicateValues } from "./duplicate-values.ts";
import {
	defineExecOperation,
	gatewayFailureExit,
	gatewayOptions,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import type { PrAddressGitHubGateway, PRSummary } from "./gateways.ts";
import { loadJsonInput } from "./json-input.ts";

export const mapBranchPrsInputSchema = z.looseObject({
	branches: z.array(z.string()),
});

const mapBranchPrsParseSchema = z.object({
	branches_json: z.string().optional(),
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
		optionValue: request.branches_json,
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

	const mapping = await mapBranchesToOpenPrs({ branches, github: ctx.context.github, ctx });
	if (mapping.type === "error") return mapping.exit;
	const result = mapping.value;
	if (result.missing_branches.length === 0 && result.ambiguous_branches.length === 0)
		return ok(result);
	return negative(mappingFailureMessage(result), result);
}

export async function mapBranchesToOpenPrs(options: {
	branches: readonly string[];
	github: PrAddressGitHubGateway;
	ctx: PrAddressExecContext;
}): Promise<
	{ type: "ok"; value: MapBranchPrsResult } | { type: "error"; exit: ClinkrFailureExit }
> {
	const openPrsResult = await options.github.listOpenPrs(gatewayOptions(options.ctx));
	if (!openPrsResult.ok)
		return {
			type: "error",
			exit: gatewayFailureExit("Failed to list open PRs", openPrsResult.error),
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

function branchPrEntry(branch: string, pr: PRSummary): BranchPrEntry {
	return {
		branch,
		pr_number: pr.number,
		title: pr.title,
		url: pr.url,
		head_ref_name: pr.head_ref_name,
		base_ref_name: pr.base_ref_name,
	};
}

function prsGroupedByHeadBranch(
	prs: readonly PRSummary[],
): ReadonlyMap<string, readonly PRSummary[]> {
	const byBranch = new Map<string, PRSummary[]>();
	for (const pr of prs) {
		const existing = byBranch.get(pr.head_ref_name) ?? [];
		existing.push(pr);
		byBranch.set(pr.head_ref_name, existing);
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
