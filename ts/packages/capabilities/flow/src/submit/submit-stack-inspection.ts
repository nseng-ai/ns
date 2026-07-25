import { runCommand } from "@nseng-ai/foundation/exec";
import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import {
	deriveValidatedGraphiteStackPath,
	type GraphiteStackGateway,
	type StackInfo,
	type StackResult,
	type TrunkMarkerStatus,
} from "@nseng-ai/capability-kit/graphite/stack";
import {
	GITHUB_CLI_TIMEOUT_MS,
	runGitHubCliAsExecResult,
} from "@nseng-ai/capability-kit/github/cli";
import { z } from "zod";

import { commandFailure, err, ok, type ErrorInfo, type GatewayResult } from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import type { SubmitStackTopology, SubmitStackTopologyBranch } from "./submit-matrix-progress.ts";

const GITHUB_PR_LIST_JSON_FIELDS = "number,url";
const githubPrIdentitySchema = z.object({ number: z.number().int().positive(), url: z.url() });
const githubPrIdentityListSchema = z.array(githubPrIdentitySchema);

export type SubmitStackInspectionProgressListener = (message: string) => void;

export interface SubmitStackInspectionParams {
	cwd: string;
	onProgress?: SubmitStackInspectionProgressListener;
}

export interface SubmitStackInspection {
	currentBranch: string;
	branches: readonly SubmitStackBranch[];
	hasUpstackBranches: boolean;
}

export type SubmitStackBranch = SubmitStackExistingBranch | SubmitStackNewBranch;

export interface SubmitBranchPrIdentity extends SubmitPrLink {
	number: number;
}

export interface SubmitStackExistingBranch {
	kind: "existing";
	branch: string;
	parentBranch: string;
	pr: SubmitBranchPrIdentity;
}

export interface SubmitStackNewBranch {
	kind: "new";
	branch: string;
	parentBranch: string;
}

interface SubmitStackBranchInfo {
	branch: string;
	parentBranch: string;
}

interface SubmitStackTopologyFacts {
	currentBranch: string;
	branches: readonly SubmitStackBranchInfo[];
	hasUpstackBranches: boolean;
}

export type SubmitBranchPrDisposition =
	| { kind: "resolved"; branch: string; pr: SubmitBranchPrIdentity }
	| { kind: "missing"; branch: string }
	| { kind: "ambiguous"; branch: string; candidates: readonly SubmitBranchPrIdentity[] }
	| { kind: "query-failed"; branch: string; diagnostic: ErrorInfo }
	| { kind: "malformed"; branch: string; diagnostic: ErrorInfo };

export interface SubmitBranchPrInventoryResult {
	dispositions: readonly SubmitBranchPrDisposition[];
}

export interface SubmitStackInspectionGateway {
	inspectSubmitStackTopology(
		params: SubmitStackInspectionParams,
	): Promise<GatewayResult<SubmitStackTopology>>;
	inspectSubmitStack(
		params: SubmitStackInspectionParams,
	): Promise<GatewayResult<SubmitStackInspection>>;
	inspectOpenPrsForBranches(params: {
		cwd: string;
		branches: readonly string[];
		onProgress?: SubmitStackInspectionProgressListener;
	}): Promise<SubmitBranchPrInventoryResult>;
}

interface RealSubmitStackInspectionGatewayOptions {
	graphite: Pick<GraphiteStackGateway, "stack">;
	runner?: CommandRunner;
}

export class RealSubmitStackInspectionGateway implements SubmitStackInspectionGateway {
	private readonly graphite: Pick<GraphiteStackGateway, "stack">;
	private readonly runner: CommandRunner;

	constructor(options: RealSubmitStackInspectionGatewayOptions) {
		this.graphite = options.graphite;
		this.runner = options.runner ?? runCommand;
	}

	async inspectSubmitStackTopology(
		params: SubmitStackInspectionParams,
	): Promise<GatewayResult<SubmitStackTopology>> {
		const inspected = await this.inspectSubmitStack(params);
		if (!inspected.ok) return inspected;
		const branches: SubmitStackTopologyBranch[] = inspected.value.branches.map((branch) => ({
			branch: branch.branch,
			parentBranch: branch.parentBranch,
			kind: branch.kind,
			...(branch.kind === "existing" ? { pr: branch.pr } : {}),
		}));
		return ok({ currentBranch: inspected.value.currentBranch, branches });
	}

	async inspectOpenPrsForBranches(params: {
		cwd: string;
		branches: readonly string[];
		onProgress?: SubmitStackInspectionProgressListener;
	}): Promise<SubmitBranchPrInventoryResult> {
		const dispositions: SubmitBranchPrDisposition[] = [];
		for (const [index, branch] of params.branches.entries()) {
			params.onProgress?.(
				`checking submitted PR for ${branch} (${index + 1}/${params.branches.length})`,
			);
			dispositions.push(await this.readOpenPrDisposition(params.cwd, branch));
		}
		return { dispositions };
	}

	async inspectSubmitStack(
		params: SubmitStackInspectionParams,
	): Promise<GatewayResult<SubmitStackInspection>> {
		const facts = deriveSubmitStackTopologyFacts(await this.graphite.stack(params.cwd));
		if (!facts.ok) return facts;
		params.onProgress?.(
			`inspecting Graphite submit scope for ${facts.value.branches.length} ${facts.value.branches.length === 1 ? "branch" : "branches"}`,
		);
		const branches: SubmitStackBranch[] = [];
		for (const [index, info] of facts.value.branches.entries()) {
			params.onProgress?.(
				`checking existing PR for ${info.branch} (${index + 1}/${facts.value.branches.length})`,
			);
			const disposition = await this.readOpenPrDisposition(params.cwd, info.branch);
			if (disposition.kind === "query-failed" || disposition.kind === "malformed") {
				return err(disposition.diagnostic);
			}
			if (disposition.kind === "ambiguous") {
				return err({
					code: "submit_branch_pr_lookup_ambiguous",
					message: `GitHub reported more than one open PR for branch ${info.branch}; close the duplicate PR or repair its head branch before submitting.`,
					details: {
						branch: info.branch,
						pr_numbers: disposition.candidates.map((pr) => pr.number),
					},
				});
			}
			branches.push(
				disposition.kind === "missing"
					? { kind: "new", branch: info.branch, parentBranch: info.parentBranch }
					: {
							kind: "existing",
							branch: info.branch,
							parentBranch: info.parentBranch,
							pr: disposition.pr,
						},
			);
		}
		return ok({
			currentBranch: facts.value.currentBranch,
			branches,
			hasUpstackBranches: facts.value.hasUpstackBranches,
		});
	}

	private async readOpenPrDisposition(
		cwd: string,
		branch: string,
	): Promise<SubmitBranchPrDisposition> {
		const args = [
			"pr",
			"list",
			"--head",
			branch,
			"--state",
			"open",
			"--limit",
			"2",
			"--json",
			GITHUB_PR_LIST_JSON_FIELDS,
		];
		const result = await runGitHubCliAsExecResult({
			runner: this.runner,
			args,
			cwd,
			timeoutMs: GITHUB_CLI_TIMEOUT_MS,
		});
		const resultError = commandError({
			command: "gh",
			args,
			result,
			code: "submit_branch_pr_lookup_failed",
			message: `Could not query open GitHub PRs for branch ${branch}.`,
		});
		if (resultError !== undefined) return { kind: "query-failed", branch, diagnostic: resultError };
		const parsed = githubPrIdentityListSchema.safeParse(parseExternalJson(result.stdout));
		if (!parsed.success) {
			return {
				kind: "malformed",
				branch,
				diagnostic: {
					code: "submit_branch_pr_lookup_parse_failed",
					message: `GitHub PR lookup for branch ${branch} returned malformed JSON.`,
				},
			};
		}
		const candidates = parsed.data.map((pr) => ({
			number: pr.number,
			label: `#${pr.number}`,
			url: pr.url,
		}));
		if (candidates.length > 1) return { kind: "ambiguous", branch, candidates };
		const pr = candidates[0];
		return pr === undefined ? { kind: "missing", branch } : { kind: "resolved", branch, pr };
	}
}

function deriveSubmitStackTopologyFacts(
	result: StackResult,
): GatewayResult<SubmitStackTopologyFacts> {
	const validated = deriveValidatedGraphiteStackPath(result);
	if (validated.type === "failure") {
		const { failure } = validated;
		switch (failure.type) {
			case "untracked_branch":
				return err({
					code: "submit_stack_untracked_branch",
					message: `${failure.message} Track the branch with \`gt track\` before submitting.`,
				});
			case "provider_failure":
				return err({
					code: "submit_stack_inspection_failed",
					message: `Could not read structured Graphite stack metadata: ${failure.failure.message}`,
					details: { return_code: failure.failure.returnCode },
				});
			case "ancestor_cycle":
				return err({
					code: "submit_stack_ancestor_cycle",
					message: `Graphite ancestor metadata contains a cycle at ${failure.branch}; submission was not attempted.`,
				});
			case "ancestor_row_missing":
				return err({
					code: "submit_stack_ancestor_row_missing",
					message: `Graphite ancestor metadata is missing branch ${failure.branch}; submission was not attempted.`,
				});
			case "trunk_marker_problem":
				return err({
					code: "submit_stack_trunk_marker_inconsistent",
					message: describeSubmitTrunkMarkerProblem(failure.marker),
				});
			case "path_inconsistent":
				return err({
					code: "submit_stack_path_inconsistent",
					message: `Graphite ancestor metadata does not form a non-empty unique path from trunk ${failure.trunk} to current branch ${failure.current}; submission was not attempted.`,
				});
		}
	}
	const { stack, path } = validated;
	if (path.length <= 1) {
		return err({
			code: "submit_stack_path_inconsistent",
			message: `Graphite ancestor metadata does not form a non-empty unique path from trunk ${stack.trunk} to current branch ${stack.current}; submission was not attempted.`,
		});
	}
	const hasUpstackBranches = deriveHasUpstackBranches(stack);
	if (!hasUpstackBranches.ok) return hasUpstackBranches;
	const branches: SubmitStackBranchInfo[] = [];
	for (let index = 1; index < path.length; index += 1) {
		const branch = path[index];
		const parentBranch = path[index - 1];
		if (branch === undefined || parentBranch === undefined) {
			return err({
				code: "submit_stack_path_inconsistent",
				message: "Graphite submit path was incomplete; submission was not attempted.",
			});
		}
		branches.push({ branch, parentBranch });
	}
	return ok({
		currentBranch: stack.current,
		branches,
		hasUpstackBranches: hasUpstackBranches.value,
	});
}

function deriveHasUpstackBranches(stack: StackInfo): GatewayResult<boolean> {
	const firstDescendant = stack.descendants[0];
	if (firstDescendant !== undefined) {
		if (firstDescendant.trim() !== "") return ok(true);
		return descendantMetadataFailure(stack, "the first child branch name is empty");
	}
	const currentFork = stack.descendantWalk.forks.find((fork) => fork.branch === stack.current);
	if (currentFork !== undefined) {
		if (currentFork.children.some((branch) => branch.trim() !== "")) return ok(true);
		return descendantMetadataFailure(stack, "the current branch has an invalid child list");
	}
	const corruption = stack.descendantWalk.childrenCorruptions.find(
		(item) => item.branch === stack.current,
	);
	if (corruption !== undefined)
		return descendantMetadataFailure(stack, `the current branch child list is ${corruption.kind}`);
	if (stack.descendantWalk.termination.type !== "completed") {
		return descendantMetadataFailure(
			stack,
			`the descendant walk ended with ${stack.descendantWalk.termination.type} at ${stack.descendantWalk.termination.branch}`,
		);
	}
	return ok(false);
}

function descendantMetadataFailure(stack: StackInfo, detail: string): GatewayResult<boolean> {
	return err({
		code: "submit_stack_descendant_metadata_inconsistent",
		message: `Could not determine whether ${stack.current} has upstack branches because ${detail}; submission was not attempted.`,
	});
}

function describeSubmitTrunkMarkerProblem(
	marker: Extract<TrunkMarkerStatus, { type: "problem" }>,
): string {
	const markedTrunks = marker.markedTrunks.length === 0 ? "none" : marker.markedTrunks.join(", ");
	return `Graphite trunk metadata is inconsistent at ${marker.terminus} (${marker.terminusState}); marked trunks: ${markedTrunks}. Submission was not attempted.`;
}

function parseExternalJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		// The caller's schema parser classifies invalid JSON as a structured lookup parse failure.
		return undefined;
	}
}

interface CommandErrorOptions {
	command: string;
	args: readonly string[];
	result: ExecResult;
	code: string;
	message: string;
}

function commandError(options: CommandErrorOptions): ErrorInfo | undefined {
	return commandFailure(options);
}
