import { formatCommand, runCommand } from "@nseng-ai/foundation/exec";
import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";
import {
	GRAPHITE_COMMAND_NAME,
	runGraphiteCommand,
} from "@nseng-ai/capability-kit/graphite/branch";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { commandFailure } from "./index.ts";
import type { PrewrittenPrMetadata, PrCommitMessage } from "./index.ts";
import { extractPrLinks, type SubmitPrLink } from "./gt-output.ts";
import {
	preparePrDescription,
	resolvePrDescriptionGeneration,
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
import { walkParentBranchChain } from "./parent-branch-chain.ts";
import type {
	SubmitMatrixCellState,
	SubmitMetadataProgressReason,
	SubmitStackTopology,
	SubmitStackTopologyBranch,
} from "./submit-matrix-progress.ts";

const GT_LOG_STACK_ARGS = ["log", "--stack", "--reverse", "--no-interactive"] as const;
const GT_TRUNK_ARGS = ["trunk", "--no-interactive"] as const;
const GT_BRANCH_INFO_BASE_ARGS = ["branch", "info", "--no-interactive", "--branch"] as const;
const GT_MODIFY_BASE_ARGS = ["modify", "--no-interactive"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const COMMAND_TIMEOUT_MS = 60_000;
const MODIFY_TIMEOUT_MS = 600_000;

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
	output: string;
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

export class RealSubmitMetadataGateway implements SubmitMetadataGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async inspectSubmitStackTopology(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackTopology>> {
		const topology = await this.inspectSubmitStackTopologyFacts(params);
		if (!topology.ok) return topology;
		const branches: SubmitStackTopologyBranch[] = [];
		for (const info of topology.value.branches) {
			const existingPr = parseExistingPrFromBranchInfo(info.output, info.branch);
			if (!existingPr.ok) return existingPr;
			branches.push({
				branch: info.branch,
				parentBranch: info.parentBranch,
				kind: existingPr.value === undefined ? "new" : "existing",
				...(existingPr.value === undefined ? {} : { pr: existingPr.value }),
			});
		}
		return ok({ currentBranch: topology.value.currentBranch, branches });
	}

	async inspectSubmitStack(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackInspection>> {
		const topology = await this.inspectSubmitStackTopologyFacts(params);
		if (!topology.ok) return topology;
		const submitBranchInfos = topology.value.branches;

		params.onProgress?.(formatStackBranchMetadataProgress(submitBranchInfos.length));
		const branches: SubmitStackBranch[] = [];
		for (const [index, info] of submitBranchInfos.entries()) {
			params.onProgress?.(
				`inspecting PR metadata for ${info.branch} (${index + 1}/${submitBranchInfos.length})`,
			);

			const existingPr = parseExistingPrFromBranchInfo(info.output, info.branch);
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
			currentBranch: topology.value.currentBranch,
			branches,
			hasUpstackBranches: topology.value.hasUpstackBranches,
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

	private async inspectSubmitStackTopologyFacts(params: SubmitMetadataCommandParams): Promise<
		GatewayResult<{
			currentBranch: string;
			branches: SubmitStackBranchInfo[];
			hasUpstackBranches: boolean;
		}>
	> {
		const log = await this.runGt([...GT_LOG_STACK_ARGS], params.cwd, COMMAND_TIMEOUT_MS);
		const logError = commandError(
			GRAPHITE_COMMAND_NAME,
			GT_LOG_STACK_ARGS,
			log,
			"submit_stack_inspection_failed",
			"Could not inspect the Graphite submit scope.",
		);
		if (logError !== undefined) return err(logError);

		const parsedLog = parseGtLogStack(log.stdout);
		if (parsedLog.branches.length === 0) {
			return err({
				code: "submit_stack_empty",
				message: "Graphite submit-scope inspection did not return any branches.",
			});
		}
		if (parsedLog.currentBranch === undefined) {
			return err({
				code: "submit_stack_current_unknown",
				message: "Graphite submit-scope inspection did not identify the current branch.",
			});
		}

		const trunk = await this.readGraphiteTrunk(params.cwd);
		if (!trunk.ok) return trunk;

		const submitBranchInfos = await this.readSubmitBranchInfos(
			params.cwd,
			parsedLog.currentBranch,
			trunk.value,
		);
		if (!submitBranchInfos.ok) return submitBranchInfos;
		return ok({
			currentBranch: parsedLog.currentBranch,
			branches: submitBranchInfos.value,
			hasUpstackBranches: hasBranchesAfterCurrent(parsedLog),
		});
	}

	// Submit metadata walks parent branches lazily through `gt branch info` so it can stop at
	// trunk without loading or trusting a full Graphite topology.
	private async readSubmitBranchInfos(
		cwd: string,
		currentBranch: string,
		trunk: string,
	): Promise<GatewayResult<SubmitStackBranchInfo[]>> {
		const branchInfos = await walkParentBranchChain<SubmitStackBranchInfo>({
			startBranch: currentBranch,
			stopBranch: trunk,
			cycleError: (branch) => ({
				code: "submit_branch_parent_cycle",
				message: `Graphite branch parent traversal looped at ${branch}.`,
			}),
			readStep: async (branch) => {
				const info = await this.runGt(
					[...GT_BRANCH_INFO_BASE_ARGS, branch],
					cwd,
					COMMAND_TIMEOUT_MS,
				);
				const infoError = commandError(
					GRAPHITE_COMMAND_NAME,
					[...GT_BRANCH_INFO_BASE_ARGS, branch],
					info,
					"submit_branch_info_failed",
					`Could not inspect Graphite branch ${branch}.`,
				);
				if (infoError !== undefined) return err(infoError);

				const parentBranch = parseParentBranch(info.stdout);
				if (parentBranch === undefined) return ok({ type: "stop" });

				return ok({
					type: "visit",
					parentBranch,
					item: {
						branch,
						parentBranch,
						output: `${info.stdout}\n${info.stderr}`,
					},
				});
			},
		});
		if (!branchInfos.ok) return branchInfos;
		return ok(branchInfos.value.reverse());
	}

	private async readGraphiteTrunk(cwd: string): Promise<GatewayResult<string>> {
		const result = await this.runGt([...GT_TRUNK_ARGS], cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError(
			GRAPHITE_COMMAND_NAME,
			GT_TRUNK_ARGS,
			result,
			"submit_trunk_inspection_failed",
			"Could not inspect the Graphite trunk branch.",
		);
		if (resultError !== undefined) return err(resultError);

		const branch = result.stdout
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.find((line) => line.length > 0);
		if (branch === undefined) {
			return err({
				code: "submit_trunk_empty",
				message: "Graphite trunk inspection did not return a branch.",
			});
		}
		return ok(branch);
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

export interface SubmitMetadataPrewriteDependencies {
	cwd: string;
	env: Record<string, string | undefined>;
	gateway: Pick<SubmitMetadataGateway, "ensureCleanWorktree" | "amendBranchMetadataCommit">;
	git: GitGateway;
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

function parseExistingPrFromBranchInfo(
	output: string,
	branch: string,
): GatewayResult<SubmitPrLink | undefined> {
	const link = extractPrLinks(output)[0];
	if (link !== undefined) return ok(link);

	if (/^\s*PR\s+#\d+\b/im.test(stripTerminalEscapes(output))) {
		return err({
			code: "submit_existing_pr_link_missing",
			message: `Graphite reported an existing PR for ${branch}, but no PR URL was detected.`,
		});
	}

	return ok(undefined);
}

export interface ParsedGtLogStack {
	branches: string[];
	currentBranch?: string;
}

export function parseGtLogStack(output: string): ParsedGtLogStack {
	const branches: string[] = [];
	let currentBranch: string | undefined;
	for (const line of stripTerminalEscapes(output).replace(/\r/g, "\n").split("\n")) {
		const match = line.match(/^[│\s]*[◉◯]\s+([^\s(]+)(?:\s+\(current\))?/);
		const branch = match?.[1];
		if (branch === undefined) continue;
		branches.push(branch);
		if (/\(current\)/.test(line)) {
			currentBranch = branch;
		}
	}
	return currentBranch === undefined ? { branches } : { branches, currentBranch };
}

function hasBranchesAfterCurrent(stack: ParsedGtLogStack): boolean {
	if (stack.currentBranch === undefined) return false;
	const currentIndex = stack.branches.indexOf(stack.currentBranch);
	return currentIndex >= 0 && currentIndex < stack.branches.length - 1;
}

export function parseParentBranch(output: string): string | undefined {
	const match = stripTerminalEscapes(output)
		.replace(/\r/g, "\n")
		.match(/^Parent:\s*(\S+)\s*$/m);
	return match?.[1];
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
