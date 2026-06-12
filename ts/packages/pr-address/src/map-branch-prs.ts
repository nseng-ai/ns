import { z } from "zod";

import { failure, negative, ok, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import type { PrAddressGitHubGateway, PRSummary } from "./gateways.ts";
import { loadJsonInput } from "./json-input.ts";
import { gatewayFailureExit, gatewayOptions } from "./operation-support.ts";

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

export interface MapBranchPrsResult {
	branch_prs: BranchPrEntry[];
	missing_branches: string[];
	summary: { requested: number; matched: number; missing: number };
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

async function runMapBranchPrsOperation(ctx: PrAddressExecContext, request: MapBranchPrsRequest): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.branches_json,
		commandName: "map-branch-prs",
		inputDescription: "branches JSON payload",
		optionName: "--branches-json",
		schema: mapBranchPrsInputSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);

	const branches = payloadResult.value.branches;
	const validationMessage = branchesValidationMessage(branches, "map-branch-prs");
	if (validationMessage !== null) return failure("invalid_request", validationMessage);

	const mapping = await mapBranchesToOpenPrs({ branches, github: ctx.context.github, ctx });
	if (mapping.type === "error") return mapping.exit;
	const result = mapping.value;
	if (result.missing_branches.length === 0) return ok(result);
	return negative(`No open PR found for branches: ${result.missing_branches.join(", ")}`, result);
}

export async function mapBranchesToOpenPrs(options: {
	branches: readonly string[];
	github: PrAddressGitHubGateway;
	ctx: PrAddressExecContext;
}): Promise<{ type: "ok"; value: MapBranchPrsResult } | { type: "error"; exit: ClinkrFailureExit }> {
	const openPrsResult = await options.github.listOpenPrs(gatewayOptions(options.ctx));
	if (openPrsResult.type === "failure") return { type: "error", exit: gatewayFailureExit("Failed to list open PRs", openPrsResult.failure) };

	const prsByHeadBranch = lowestNumberedPrByHeadBranch(openPrsResult.value);
	const branchPrs: BranchPrEntry[] = [];
	const missingBranches: string[] = [];
	for (const branch of options.branches) {
		const pr = prsByHeadBranch.get(branch);
		if (pr === undefined) {
			missingBranches.push(branch);
			continue;
		}
		branchPrs.push({
			branch,
			pr_number: pr.number,
			title: pr.title,
			url: pr.url,
			head_ref_name: pr.head_ref_name,
			base_ref_name: pr.base_ref_name,
		});
	}
	return {
		type: "ok",
		value: {
			branch_prs: branchPrs,
			missing_branches: missingBranches,
			summary: { requested: options.branches.length, matched: branchPrs.length, missing: missingBranches.length },
		},
	};
}

export function branchesValidationMessage(branches: readonly string[], commandName: string): string | null {
	if (branches.length === 0) return `${commandName} requires at least one branch.`;
	if (!branches.every((branch) => branch.trim() !== "")) return `${commandName} requires every branch to be non-empty.`;
	const duplicates = duplicateValues(branches);
	if (duplicates.length > 0) return `${commandName} branches contain duplicates: ${duplicates.join(", ")}`;
	return null;
}

/** Multiple open PRs can share a head branch (e.g. a retargeted duplicate); pick the lowest PR number for determinism. */
function lowestNumberedPrByHeadBranch(prs: readonly PRSummary[]): ReadonlyMap<string, PRSummary> {
	const byBranch = new Map<string, PRSummary>();
	for (const pr of prs) {
		const existing = byBranch.get(pr.head_ref_name);
		if (existing === undefined || pr.number < existing.number) byBranch.set(pr.head_ref_name, pr);
	}
	return byBranch;
}

function duplicateValues(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) duplicates.add(value);
		seen.add(value);
	}
	return [...duplicates];
}
