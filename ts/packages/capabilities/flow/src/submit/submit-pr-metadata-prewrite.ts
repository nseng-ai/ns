import { formatCommand, runCommand } from "@nseng-ai/foundation/exec";
import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import {
	GRAPHITE_COMMAND_NAME,
	runGraphiteCommand,
} from "@nseng-ai/capability-kit/graphite/branch";
import type {
	GraphiteStackGateway,
	StackInfo,
	StackResult,
} from "@nseng-ai/capability-kit/graphite/stack";
import {
	GITHUB_CLI_TIMEOUT_MS,
	runGitHubCliAsExecResult,
} from "@nseng-ai/capability-kit/github/cli";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { z } from "zod";
import { commandFailure } from "./index.ts";
import type { PrewrittenPrMetadata, PrCommitMessage } from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import {
	preparePrDescription,
	resolvePrDescriptionGeneration,
	type FlowPrDescriptionDescriptorSource,
	type TimeServices,
} from "./index.ts";
import { err, ok, type ErrorInfo, type GatewayResult } from "./index.ts";
import type { TextGenerator } from "./index.ts";
import { formatBatchPosition, formatItemCount } from "./submit-format.ts";
import {
	commandOperations,
	modelOperation,
	withActiveOperations,
} from "../phase-stream/matrix-progress-core.ts";
import type { SubmitProgressListeners } from "./submit-progress-listeners.ts";
import type { SubmitPlan } from "./submit-plan.ts";
import type {
	SubmitMatrixCellState,
	SubmitMetadataProgressReason,
	SubmitStackTopology,
	SubmitStackTopologyBranch,
} from "./submit-matrix-progress.ts";

const GT_MODIFY_BASE_ARGS = ["modify", "--no-interactive"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const GITHUB_PR_LIST_JSON_FIELDS = "number,url";
const COMMAND_TIMEOUT_MS = 60_000;
const MODIFY_TIMEOUT_MS = 600_000;

const githubPrIdentitySchema = z.object({
	number: z.number().int().positive(),
	url: z.url(),
});
const githubPrIdentityListSchema = z.array(githubPrIdentitySchema);

export type SubmitMetadataProgressListener = (message: string) => void;
export interface SubmitBranchMetadataProgressEvent {
	branch: string;
	state: Exclude<SubmitMatrixCellState, "pending">;
	reason?: SubmitMetadataProgressReason;
}
export type SubmitBranchMetadataProgressListener = (
	event: SubmitBranchMetadataProgressEvent,
) => void;

export interface SubmitMetadataCommandParams {
	cwd: string;
	onProgress?: SubmitMetadataProgressListener;
}

export interface SubmitStackInspection {
	currentBranch: string;
	branches: readonly SubmitStackBranch[];
	hasUpstackBranches: boolean;
}

export type SubmitStackBranch = SubmitStackExistingBranch | SubmitStackNewBranch;

export interface SubmitStackExistingBranch {
	kind: "existing";
	branch: string;
	parentBranch: string;
	pr: SubmitPrLink;
}

export interface SubmitStackNewBranch {
	kind: "new";
	branch: string;
	parentBranch: string;
	commitMessages: readonly PrCommitMessage[];
	diff: string;
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

export interface SubmitMetadataGateway {
	inspectSubmitStackTopology(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackTopology>>;
	inspectSubmitStack(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackInspection>>;
	ensureCleanWorktree(params: SubmitMetadataCommandParams): Promise<GatewayResult<void>>;
	amendBranchMetadataCommit(
		params: AmendBranchMetadataParams & { cwd: string },
	): Promise<GatewayResult<void>>;
}

interface AmendBranchMetadataParams {
	currentBranch: string;
	branch: string;
	title: string;
	body: string;
}

interface AmendBranchMetadataCommandShape {
	/** Full argv for execution, including the `-m` message arguments. */
	argv: string[];
	/** Safe progress display; never contains title/body message arguments. */
	display: string;
}

/**
 * Single source of the `gt modify` amendment command shape so the executed invocation and
 * the reported operation display cannot drift; the display deliberately excludes the `-m`
 * message arguments because they carry generated PR content.
 */
function amendBranchMetadataCommandShape(
	params: AmendBranchMetadataParams,
): AmendBranchMetadataCommandShape {
	const targetArgs =
		params.currentBranch === params.branch
			? [...GT_MODIFY_BASE_ARGS]
			: [...GT_MODIFY_BASE_ARGS, "--into", params.branch];
	return {
		argv: [...targetArgs, "-m", params.title, "-m", params.body],
		display: formatCommand(GRAPHITE_COMMAND_NAME, targetArgs),
	};
}

export type SubmitMetadataPrewriteResult =
	| { kind: "prepared"; prepared: PrewrittenPrMetadata[] }
	| {
			kind: "failed";
			error: string;
			exitCode?: number;
			amendedBranches: string[];
			diagnostic?: ErrorInfo;
	  };

interface RealSubmitMetadataGatewayOptions {
	graphite: Pick<GraphiteStackGateway, "stack">;
	runner?: CommandRunner;
}

export class RealSubmitMetadataGateway implements SubmitMetadataGateway {
	private readonly graphite: Pick<GraphiteStackGateway, "stack">;
	private readonly runner: CommandRunner;

	constructor(options: RealSubmitMetadataGatewayOptions) {
		this.graphite = options.graphite;
		this.runner = options.runner ?? runCommand;
	}

	async inspectSubmitStackTopology(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackTopology>> {
		const facts = await this.inspectSubmitStackTopologyFacts(params);
		if (!facts.ok) return facts;

		const branches: SubmitStackTopologyBranch[] = [];
		for (const info of facts.value.branches) {
			const existingPr = await this.readOpenPrForBranch(params.cwd, info.branch);
			if (!existingPr.ok) return existingPr;
			branches.push({
				branch: info.branch,
				parentBranch: info.parentBranch,
				kind: existingPr.value === undefined ? "new" : "existing",
				...(existingPr.value === undefined ? {} : { pr: existingPr.value }),
			});
		}
		return ok({ currentBranch: facts.value.currentBranch, branches });
	}

	async inspectSubmitStack(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackInspection>> {
		const facts = await this.inspectSubmitStackTopologyFacts(params);
		if (!facts.ok) return facts;
		const submitBranchInfos = facts.value.branches;

		params.onProgress?.(formatStackBranchMetadataProgress(submitBranchInfos.length));
		const branches: SubmitStackBranch[] = [];
		for (const [index, info] of submitBranchInfos.entries()) {
			params.onProgress?.(
				`inspecting PR metadata for ${info.branch} (${index + 1}/${submitBranchInfos.length})`,
			);

			const existingPr = await this.readOpenPrForBranch(params.cwd, info.branch);
			if (!existingPr.ok) return existingPr;
			if (existingPr.value !== undefined) {
				branches.push({
					kind: "existing",
					branch: info.branch,
					parentBranch: info.parentBranch,
					pr: existingPr.value,
				});
				continue;
			}

			params.onProgress?.(`reading local commits and diff for ${info.branch}`);
			const commitMessages = await this.readBranchCommitMessages(
				params.cwd,
				info.parentBranch,
				info.branch,
			);
			if (!commitMessages.ok) return commitMessages;
			const diff = await this.readBranchDiff(params.cwd, info.parentBranch, info.branch);
			if (!diff.ok) return diff;

			branches.push({
				kind: "new",
				branch: info.branch,
				parentBranch: info.parentBranch,
				commitMessages: commitMessages.value,
				diff: diff.value,
			});
		}

		return ok({
			currentBranch: facts.value.currentBranch,
			branches,
			hasUpstackBranches: facts.value.hasUpstackBranches,
		});
	}

	async ensureCleanWorktree(params: SubmitMetadataCommandParams): Promise<GatewayResult<void>> {
		const result = await this.runGit(
			[...GIT_STATUS_PORCELAIN_ARGS],
			params.cwd,
			COMMAND_TIMEOUT_MS,
		);
		const resultError = commandError(
			"git",
			GIT_STATUS_PORCELAIN_ARGS,
			result,
			"submit_metadata_clean_check_failed",
			"Could not verify that the worktree is clean before amending PR metadata.",
		);
		if (resultError !== undefined) return err(resultError);
		if (result.stdout.trim() !== "") {
			return err({
				code: "submit_metadata_dirty_worktree",
				message:
					"Worktree became dirty before PR metadata amendment. Submission was not attempted.",
			});
		}
		return ok(undefined);
	}

	async amendBranchMetadataCommit(
		params: AmendBranchMetadataParams & { cwd: string },
	): Promise<GatewayResult<void>> {
		const args = amendBranchMetadataCommandShape(params).argv;
		const result = await this.runGt(args, params.cwd, MODIFY_TIMEOUT_MS);
		const resultError = commandError(
			GRAPHITE_COMMAND_NAME,
			args,
			result,
			"submit_metadata_amend_failed",
			`Could not amend local PR metadata commit for ${params.branch}.`,
		);
		if (resultError !== undefined) return err(resultError);
		return ok(undefined);
	}

	private async inspectSubmitStackTopologyFacts(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackTopologyFacts>> {
		return deriveSubmitStackTopologyFacts(await this.graphite.stack(params.cwd));
	}

	private async readOpenPrForBranch(
		cwd: string,
		branch: string,
	): Promise<GatewayResult<SubmitPrLink | undefined>> {
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
		const resultError = commandError(
			"gh",
			args,
			result,
			"submit_branch_pr_lookup_failed",
			`Could not query open GitHub PRs for branch ${branch}.`,
		);
		if (resultError !== undefined) return err(resultError);

		const parsed = githubPrIdentityListSchema.safeParse(parseExternalJson(result.stdout));
		if (!parsed.success) {
			return err({
				code: "submit_branch_pr_lookup_parse_failed",
				message: `GitHub PR lookup for branch ${branch} returned malformed JSON.`,
			});
		}
		if (parsed.data.length > 1) {
			return err({
				code: "submit_branch_pr_lookup_ambiguous",
				message: `GitHub reported more than one open PR for branch ${branch}; close the duplicate PR or repair its head branch before submitting.`,
				details: { branch, pr_numbers: parsed.data.map((pr) => pr.number) },
			});
		}

		const pr = parsed.data[0];
		return ok(pr === undefined ? undefined : { label: `#${pr.number}`, url: pr.url });
	}

	private async readBranchCommitMessages(
		cwd: string,
		parentBranch: string,
		branch: string,
	): Promise<GatewayResult<PrCommitMessage[]>> {
		const args = ["log", "--format=%B%x00", `${parentBranch}..${branch}`];
		const result = await this.runGit(args, cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError(
			"git",
			args,
			result,
			"submit_branch_commits_failed",
			`Could not read commits for ${branch}.`,
		);
		if (resultError !== undefined) return err(resultError);
		return ok(parseCommitMessages(result.stdout));
	}

	private async readBranchDiff(
		cwd: string,
		parentBranch: string,
		branch: string,
	): Promise<GatewayResult<string>> {
		const args = ["diff", `${parentBranch}..${branch}`];
		const result = await this.runGit(args, cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError(
			"git",
			args,
			result,
			"submit_branch_diff_failed",
			`Could not read diff for ${branch}.`,
		);
		if (resultError !== undefined) return err(resultError);
		return ok(result.stdout);
	}

	private async runGt(args: string[], cwd: string, timeoutMs: number): Promise<ExecResult> {
		return runGraphiteCommand(this.runner, { cwd, args, timeoutMs });
	}

	private async runGit(args: string[], cwd: string, timeoutMs: number): Promise<ExecResult> {
		return this.runner("git", args, { cwd, timeout: timeoutMs });
	}
}

function deriveSubmitStackTopologyFacts(
	result: StackResult,
): GatewayResult<SubmitStackTopologyFacts> {
	if (result.type === "untracked_branch") {
		return err({
			code: "submit_stack_untracked_branch",
			message: `${result.message} Track the branch with \`gt track\` before submitting.`,
		});
	}
	if (result.type === "failure") {
		return err({
			code: "submit_stack_inspection_failed",
			message: `Could not read structured Graphite stack metadata: ${result.failure.message}`,
			details: { return_code: result.failure.returnCode },
		});
	}

	const { stack } = result;
	if (stack.ancestorTermination.type === "cycle") {
		return err({
			code: "submit_stack_ancestor_cycle",
			message: `Graphite ancestor metadata contains a cycle at ${stack.ancestorTermination.branch}; submission was not attempted.`,
		});
	}
	if (stack.ancestorTermination.type === "row_missing") {
		return err({
			code: "submit_stack_ancestor_row_missing",
			message: `Graphite ancestor metadata is missing branch ${stack.ancestorTermination.branch}; submission was not attempted.`,
		});
	}
	if (stack.trunkMarker.type === "problem") {
		return err({
			code: "submit_stack_trunk_marker_inconsistent",
			message: describeSubmitTrunkMarkerProblem(stack),
		});
	}

	const path = [...stack.ancestors, stack.current];
	if (
		path.length <= 1 ||
		stack.trunk.trim() === "" ||
		stack.current.trim() === "" ||
		path[0] !== stack.trunk ||
		path.some((branch) => branch.trim() === "") ||
		new Set(path).size !== path.length
	) {
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

	const currentCorruption = stack.descendantWalk.childrenCorruptions.find(
		(corruption) => corruption.branch === stack.current,
	);
	if (currentCorruption !== undefined) {
		return descendantMetadataFailure(
			stack,
			`the current branch child list is ${currentCorruption.kind}`,
		);
	}
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

function describeSubmitTrunkMarkerProblem(stack: StackInfo): string {
	if (stack.trunkMarker.type === "clean") {
		throw new Error("Expected inconsistent Graphite trunk marker metadata.");
	}
	const markedTrunks =
		stack.trunkMarker.markedTrunks.length === 0
			? "none"
			: stack.trunkMarker.markedTrunks.join(", ");
	return `Graphite trunk metadata is inconsistent at ${stack.trunkMarker.terminus} (${stack.trunkMarker.terminusState}); marked trunks: ${markedTrunks}. Submission was not attempted.`;
}

function parseExternalJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export interface SubmitMetadataPrewriteDependencies {
	cwd: string;
	env: Record<string, string | undefined>;
	gateway: Pick<SubmitMetadataGateway, "ensureCleanWorktree" | "amendBranchMetadataCommit">;
	git: GitGateway;
	descriptorSource: FlowPrDescriptionDescriptorSource;
	textGenerator: TextGenerator;
	time?: TimeServices;
	progress?: SubmitProgressListeners<SubmitBranchMetadataProgressEvent>;
}

export async function prewriteSubmitMetadata(
	plan: SubmitPlan,
	input: SubmitMetadataPrewriteDependencies,
): Promise<SubmitMetadataPrewriteResult> {
	for (const branch of plan.skippedMetadataBranches) {
		input.progress?.onItemProgress?.({
			branch: branch.branch,
			state: "skipped",
			reason: branch.kind === "existing" ? "existing-pr" : "amendment-not-applicable",
		});
	}
	input.progress?.onProgress?.(
		formatMetadataPreparationDiscoveryProgress(
			plan.branches.length,
			plan.metadataPrewriteBranches.length,
		),
	);
	if (plan.metadataPrewriteBranches.length === 0) {
		input.progress?.onProgress?.("no pre-submit PR metadata changes needed");
		return { kind: "prepared", prepared: [] };
	}

	const generated = await generateMetadataForBranches({
		cwd: input.cwd,
		env: input.env,
		git: input.git,
		descriptorSource: input.descriptorSource,
		textGenerator: input.textGenerator,
		branches: plan.metadataPrewriteBranches,
		...(input.time === undefined ? {} : { time: input.time }),
		...(input.progress === undefined ? {} : { progress: input.progress }),
	});
	if (generated.kind === "failed") return { ...generated, amendedBranches: [] };
	if (generated.prepared.length === 0) return { kind: "prepared", prepared: [] };

	input.progress?.onProgress?.("checking clean worktree before metadata amendment");
	const clean = await input.gateway.ensureCleanWorktree({ cwd: input.cwd });
	if (!clean.ok) {
		return { kind: "failed", error: clean.error.message, amendedBranches: [] };
	}

	const amendedBranches: string[] = [];
	for (const [index, metadata] of generated.prepared.entries()) {
		input.progress?.onProgress?.(
			`amending local PR metadata commit for ${metadata.branch} (${index + 1}/${generated.prepared.length})`,
		);
		input.progress?.onItemProgress?.({
			branch: metadata.branch,
			state: "active",
			reason: "amending-metadata-commit",
		});
		const amendParams = {
			currentBranch: plan.currentBranch,
			branch: metadata.branch,
			title: metadata.title,
			body: metadata.body,
		};
		const amended = await withActiveOperations(
			input.progress?.onActiveOperations,
			commandOperations([amendBranchMetadataCommandShape(amendParams).display]),
			() => input.gateway.amendBranchMetadataCommit({ cwd: input.cwd, ...amendParams }),
		);
		if (!amended.ok) {
			input.progress?.onItemProgress?.({
				branch: metadata.branch,
				state: "failed",
				reason: "metadata-amendment-failed",
			});
			return {
				kind: "failed",
				error: `Could not amend local PR metadata for ${metadata.branch}: ${amended.error.message}. Submission was not attempted.${amendedBranches.length === 0 ? "" : " Earlier branches may already have amended commit messages."}`,
				amendedBranches,
				diagnostic: amended.error,
			};
		}
		amendedBranches.push(metadata.branch);
		input.progress?.onItemProgress?.({
			branch: metadata.branch,
			state: "done",
			reason: "metadata-prepared",
		});
	}

	input.progress?.onProgress?.(formatPreparedMetadataProgress(generated.prepared.length));
	return { kind: "prepared", prepared: generated.prepared };
}

async function generateMetadataForBranches(input: {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	descriptorSource: FlowPrDescriptionDescriptorSource;
	textGenerator: TextGenerator;
	branches: readonly SubmitStackNewBranch[];
	time?: TimeServices;
	progress?: SubmitProgressListeners<SubmitBranchMetadataProgressEvent>;
}): Promise<
	| { kind: "prepared"; prepared: PrewrittenPrMetadata[] }
	| { kind: "failed"; error: string; exitCode?: number }
> {
	const generation = await resolvePrDescriptionGeneration({
		env: input.env,
		cwd: input.cwd,
		git: input.git,
		descriptorSource: input.descriptorSource,
	});
	if (!generation.ok) {
		return {
			kind: "failed",
			error: generation.error,
			...(generation.exitCode === undefined ? {} : { exitCode: generation.exitCode }),
		};
	}

	input.progress?.onProgress?.(`resolved PR metadata model ${generation.modelRef}`);
	const prepared: PrewrittenPrMetadata[] = [];
	for (const [index, branch] of input.branches.entries()) {
		input.progress?.onProgress?.(
			`generating initial PR metadata for ${branch.branch} (${index + 1}/${input.branches.length})`,
		);
		input.progress?.onItemProgress?.({
			branch: branch.branch,
			state: "active",
			reason: "generating-metadata",
		});
		const currentTitle = branch.commitMessages[0]?.headline ?? branch.branch;
		// One model operation spans the whole generation, including repair attempts.
		const generated = await withActiveOperations(
			input.progress?.onActiveOperations,
			[
				modelOperation(
					"generating PR metadata",
					generation.modelRef,
					formatBatchPosition({ noun: "branch", index, total: input.branches.length }),
				),
			],
			() =>
				preparePrDescription({
					textGenerator: input.textGenerator,
					modelRef: generation.modelRef,
					promptText: generation.promptText,
					context: {
						kind: "local",
						title: currentTitle,
						headRefName: branch.branch,
						baseRefName: branch.parentBranch,
						commitMessages: branch.commitMessages,
						diff: branch.diff,
					},
					...(input.progress?.onProgress === undefined
						? {}
						: { onProgress: input.progress.onProgress }),
					...(input.time === undefined ? {} : { time: input.time }),
				}),
		);
		if (!generated.ok) {
			input.progress?.onItemProgress?.({
				branch: branch.branch,
				state: "failed",
				reason: "metadata-generation-failed",
			});
			return {
				kind: "failed",
				error: `Could not generate initial PR metadata for ${branch.branch}: ${generated.error}`,
			};
		}
		input.progress?.onItemProgress?.({
			branch: branch.branch,
			state: "done",
			reason: "metadata-drafted",
		});
		prepared.push({
			branch: branch.branch,
			parentBranch: branch.parentBranch,
			title: generated.title,
			body: generated.body,
			commitRange: `${branch.parentBranch}..${branch.branch}`,
			promptSource: generation.promptSource,
		});
	}
	return { kind: "prepared", prepared };
}

function commandError(
	command: string,
	args: readonly string[],
	result: ExecResult,
	code: string,
	message: string,
): ErrorInfo | undefined {
	return commandFailure({ command, args, result, code, message });
}

function formatStackBranchMetadataProgress(branchCount: number): string {
	return `inspecting Graphite submit branch metadata for ${formatItemCount(branchCount, "branch", "branches")}`;
}

function formatMetadataPreparationDiscoveryProgress(
	totalBranchCount: number,
	newBranchCount: number,
): string {
	return `found ${formatItemCount(totalBranchCount, "submit branch", "submit branches")}; ${formatItemCount(newBranchCount, "new single-commit branch", "new single-commit branches")} ${newBranchCount === 1 ? "needs" : "need"} initial PR metadata`;
}

function formatPreparedMetadataProgress(branchCount: number): string {
	return `prepared pre-submit PR metadata for ${formatItemCount(branchCount, "branch", "branches")}`;
}

export function parseCommitMessages(output: string): PrCommitMessage[] {
	return output
		.split("\0")
		.map((message) => message.trim())
		.filter((message) => message !== "")
		.map((message) => {
			const lines = message.split("\n");
			const headline = lines[0]?.trim() ?? "";
			const body = lines.slice(1).join("\n").trim();
			return {
				headline,
				...(body === "" ? {} : { body }),
			};
		})
		.filter((message) => message.headline !== "");
}
