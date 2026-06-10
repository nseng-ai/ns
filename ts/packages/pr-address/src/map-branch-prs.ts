import { z } from "zod";

import { clinkrFailure, clinkrNegative, clinkrOk } from "./clinkr-envelope.ts";
import { gatewayFailureMessage, gatewayOptions, githubGateway, parseReadOptions } from "./feedback-collection.ts";
import type { PRSummary } from "./gateways.ts";
import { loadJsonInput } from "./json-input.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

const mapBranchPrsInputSchema = z.looseObject({
	branches: z.array(z.string()),
});

interface BranchPrEntry {
	branch: string;
	pr_number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
}

interface MapBranchPrsResult {
	branch_prs: BranchPrEntry[];
	missing_branches: string[];
	summary: { requested: number; matched: number; missing: number };
}

export async function runMapBranchPrsOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseReadOptions(invocation.args, ["--branches-json"], []);
	if (parsed.type === "error") return exitFailure("invalid_request", parsed.message);
	const unexpectedPositional = parsed.options.positionals[0];
	if (unexpectedPositional !== undefined) return exitFailure("invalid_request", `Unexpected argument for map-branch-prs: ${unexpectedPositional}`);

	const payloadResult = await loadJsonInput({
		optionValue: parsed.options.values.get("--branches-json"),
		commandName: "map-branch-prs",
		inputDescription: "branches JSON payload",
		optionName: "--branches-json",
		schema: mapBranchPrsInputSchema,
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return exitFailure(payloadResult.error.errorType, payloadResult.error.message);

	const branches = payloadResult.value.branches;
	const validationMessage = branchesValidationMessage(branches);
	if (validationMessage !== null) return exitFailure("invalid_request", validationMessage);

	const github = githubGateway(invocation);
	if (github.type === "error") return github.result;
	const openPrsResult = await github.gateway.listOpenPrs(gatewayOptions(invocation));
	if (openPrsResult.type === "failure") return exitFailure("pr_gateway_failure", gatewayFailureMessage("Failed to list open PRs", openPrsResult.failure));

	const prsByHeadBranch = lowestNumberedPrByHeadBranch(openPrsResult.value);
	const branchPrs: BranchPrEntry[] = [];
	const missingBranches: string[] = [];
	for (const branch of branches) {
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
	const result: MapBranchPrsResult = {
		branch_prs: branchPrs,
		missing_branches: missingBranches,
		summary: { requested: branches.length, matched: branchPrs.length, missing: missingBranches.length },
	};
	if (missingBranches.length === 0) return { type: "exit", exit: clinkrOk(result) };
	return { type: "exit", exit: clinkrNegative(result, `No open PR found for branches: ${missingBranches.join(", ")}`) };
}

function branchesValidationMessage(branches: readonly string[]): string | null {
	if (branches.length === 0) return "map-branch-prs requires at least one branch.";
	if (!branches.every((branch) => branch.trim() !== "")) return "map-branch-prs requires every branch to be non-empty.";
	const duplicates = duplicateValues(branches);
	if (duplicates.length > 0) return `map-branch-prs branches contain duplicates: ${duplicates.join(", ")}`;
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

function exitFailure(errorType: string, message: string): ExecOperationDispatchResult {
	return { type: "exit", exit: clinkrFailure(errorType, message) };
}
