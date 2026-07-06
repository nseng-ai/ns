import { runCommand } from "@nseng-ai/foundation/exec";
import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";
import {
	GRAPHITE_COMMAND_NAME,
	runGraphiteCommand,
} from "@nseng-ai/capability-kit/graphite/branch";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import type { MaybePromise } from "@nseng-ai/foundation/primitives";

import { commandFailure } from "./index.ts";
import type { PrewrittenPrMetadata, PrCommitMessage } from "./index.ts";
import { extractPrLinks, type SubmitPrLink } from "./gt-output.ts";
import { preparePrDescription, resolvePrDescriptionGeneration } from "./index.ts";
import { err, ok, type ErrorInfo, type GatewayResult } from "./index.ts";
import type { TextGenerator } from "./index.ts";
import { formatItemCount } from "./submit-format.ts";
import type { SubmitStackTopology, SubmitStackTopologyBranch } from "./submit-matrix-progress.ts";

const GT_LOG_STACK_ARGS = ["log", "--stack", "--reverse", "--no-interactive"] as const;
const GT_TRUNK_ARGS = ["trunk", "--no-interactive"] as const;
const GT_BRANCH_INFO_BASE_ARGS = ["branch", "info", "--no-interactive", "--branch"] as const;
const GT_MODIFY_BASE_ARGS = ["modify", "--no-interactive"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const COMMAND_TIMEOUT_MS = 60_000;
const MODIFY_TIMEOUT_MS = 600_000;

export type SubmitMetadataProgressListener = (message: string) => void;
export type SubmitBranchMetadataProgressListener = (event: {
	branch: string;
	state: "active" | "done" | "skipped" | "failed";
	message?: string;
}) => void;

export interface SubmitMetadataCommandParams {
	cwd: string;
	onProgress?: SubmitMetadataProgressListener;
}

export interface SubmitStackInspection {
	currentBranch: string;
	branches: readonly SubmitStackBranch[];
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

type ParentBranchWalkStep<T> =
	| { readonly type: "visit"; readonly parentBranch: string | undefined; readonly item: T }
	| { readonly type: "stop" };

export interface SubmitMetadataGateway {
	inspectSubmitStackTopology(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackTopology>>;
	inspectSubmitStack(
		params: SubmitMetadataCommandParams,
	): Promise<GatewayResult<SubmitStackInspection>>;
	ensureCleanWorktree(params: SubmitMetadataCommandParams): Promise<GatewayResult<void>>;
	amendBranchMetadataCommit(params: {
		cwd: string;
		currentBranch: string;
		branch: string;
		title: string;
		body: string;
	}): Promise<GatewayResult<void>>;
}

export type SubmitPrMetadataPrewriteResult =
	| { kind: "prepared"; prepared: PrewrittenPrMetadata[] }
	| { kind: "failed"; error: string; exitCode?: number; amendedBranches: string[] };

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

		return ok({ currentBranch: topology.value.currentBranch, branches });
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

	async amendBranchMetadataCommit(params: {
		cwd: string;
		currentBranch: string;
		branch: string;
		title: string;
		body: string;
	}): Promise<GatewayResult<void>> {
		const args =
			params.currentBranch === params.branch
				? [...GT_MODIFY_BASE_ARGS, "-m", params.title, "-m", params.body]
				: [...GT_MODIFY_BASE_ARGS, "--into", params.branch, "-m", params.title, "-m", params.body];
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
	): Promise<GatewayResult<{ currentBranch: string; branches: SubmitStackBranchInfo[] }>> {
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
		return ok({ currentBranch: parsedLog.currentBranch, branches: submitBranchInfos.value });
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

export async function prepareSubmitPrMetadata(input: {
	cwd: string;
	env: Record<string, string | undefined>;
	gateway: SubmitMetadataGateway;
	git: GitGateway;
	textGenerator: TextGenerator;
	onProgress?: SubmitMetadataProgressListener;
	onBranchProgress?: SubmitBranchMetadataProgressListener;
}): Promise<SubmitPrMetadataPrewriteResult> {
	input.onProgress?.("inspecting Graphite submit scope before metadata preparation");
	const inspected = await input.gateway.inspectSubmitStack({
		cwd: input.cwd,
		...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
	});
	if (!inspected.ok) {
		return { kind: "failed", error: inspected.error.message, amendedBranches: [] };
	}

	const amendableBranches = await findAmendableBranchNames(inspected.value);
	if (!amendableBranches.ok) {
		return { kind: "failed", error: amendableBranches.error.message, amendedBranches: [] };
	}
	const newBranches = inspected.value.branches.filter(
		(branch): branch is SubmitStackNewBranch =>
			branch.kind === "new" &&
			branch.commitMessages.length === 1 &&
			amendableBranches.value.has(branch.branch),
	);
	const metadataBranches = new Set(newBranches.map((branch) => branch.branch));
	for (const branch of inspected.value.branches) {
		if (branch.kind === "existing") {
			input.onBranchProgress?.({ branch: branch.branch, state: "skipped", message: "existing PR" });
			continue;
		}
		if (!metadataBranches.has(branch.branch)) {
			input.onBranchProgress?.({
				branch: branch.branch,
				state: "skipped",
				message: "metadata amendment not applicable",
			});
		}
	}
	input.onProgress?.(
		formatMetadataPreparationDiscoveryProgress(inspected.value.branches.length, newBranches.length),
	);
	if (newBranches.length === 0) {
		input.onProgress?.("no pre-submit PR metadata changes needed");
		return { kind: "prepared", prepared: [] };
	}

	const generated = await generateMetadataForBranches({
		cwd: input.cwd,
		env: input.env,
		git: input.git,
		textGenerator: input.textGenerator,
		branches: newBranches,
		...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
		...(input.onBranchProgress === undefined ? {} : { onBranchProgress: input.onBranchProgress }),
	});
	if (generated.kind === "failed") {
		return { ...generated, amendedBranches: [] };
	}
	if (generated.prepared.length === 0) {
		return { kind: "prepared", prepared: [] };
	}

	input.onProgress?.("checking clean worktree before metadata amendment");
	const clean = await input.gateway.ensureCleanWorktree({ cwd: input.cwd });
	if (!clean.ok) {
		return { kind: "failed", error: clean.error.message, amendedBranches: [] };
	}

	const amendedBranches: string[] = [];
	for (const [index, metadata] of generated.prepared.entries()) {
		input.onProgress?.(
			`amending local PR metadata commit for ${metadata.branch} (${index + 1}/${generated.prepared.length})`,
		);
		input.onBranchProgress?.({
			branch: metadata.branch,
			state: "active",
			message: "amending metadata commit",
		});
		const amended = await input.gateway.amendBranchMetadataCommit({
			cwd: input.cwd,
			currentBranch: inspected.value.currentBranch,
			branch: metadata.branch,
			title: metadata.title,
			body: metadata.body,
		});
		if (!amended.ok) {
			input.onBranchProgress?.({
				branch: metadata.branch,
				state: "failed",
				message: "metadata amendment failed",
			});
			return {
				kind: "failed",
				error: `Could not amend local PR metadata for ${metadata.branch}: ${amended.error.message}. Submission was not attempted.${amendedBranches.length === 0 ? "" : " Earlier branches may already have amended commit messages."}`,
				amendedBranches,
			};
		}
		amendedBranches.push(metadata.branch);
		input.onBranchProgress?.({
			branch: metadata.branch,
			state: "done",
			message: "metadata prepared",
		});
	}

	input.onProgress?.(formatPreparedMetadataProgress(generated.prepared.length));
	return { kind: "prepared", prepared: generated.prepared };
}

async function generateMetadataForBranches(input: {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	textGenerator: TextGenerator;
	branches: readonly SubmitStackNewBranch[];
	onProgress?: SubmitMetadataProgressListener;
	onBranchProgress?: SubmitBranchMetadataProgressListener;
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

	input.onProgress?.(`resolved PR metadata model ${generation.modelRef}`);
	const prepared: PrewrittenPrMetadata[] = [];
	for (const [index, branch] of input.branches.entries()) {
		input.onProgress?.(
			`generating initial PR metadata for ${branch.branch} (${index + 1}/${input.branches.length})`,
		);
		input.onBranchProgress?.({
			branch: branch.branch,
			state: "active",
			message: "generating metadata",
		});
		const currentTitle = branch.commitMessages[0]?.headline ?? branch.branch;
		const generated = await preparePrDescription({
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
			...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
		});
		if (!generated.ok) {
			input.onBranchProgress?.({
				branch: branch.branch,
				state: "failed",
				message: "metadata generation failed",
			});
			return {
				kind: "failed",
				error: `Could not generate initial PR metadata for ${branch.branch}: ${generated.error}`,
			};
		}
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

async function findAmendableBranchNames(
	inspection: SubmitStackInspection,
): Promise<GatewayResult<Set<string>>> {
	const byBranch = new Map(inspection.branches.map((branch) => [branch.branch, branch]));
	const branchNames = await walkParentBranchChain<string>({
		startBranch: inspection.currentBranch,
		cycleError: (branch) => ({
			code: "submit_amendable_parent_cycle",
			message: `Submit branch amendment traversal looped at ${branch}.`,
		}),
		readStep: (branch) =>
			ok({
				type: "visit",
				parentBranch: byBranch.get(branch)?.parentBranch,
				item: branch,
			}),
	});
	if (!branchNames.ok) return branchNames;
	return ok(new Set(branchNames.value));
}

async function walkParentBranchChain<T>(input: {
	readonly startBranch: string;
	readonly stopBranch?: string;
	readonly cycleError: (branch: string) => ErrorInfo;
	readonly readStep: (branch: string) => MaybePromise<GatewayResult<ParentBranchWalkStep<T>>>;
}): Promise<GatewayResult<T[]>> {
	const items: T[] = [];
	const visited = new Set<string>();
	let branch: string | undefined = input.startBranch;
	while (branch !== undefined && branch !== input.stopBranch) {
		if (visited.has(branch)) return err(input.cycleError(branch));
		visited.add(branch);

		const step = await input.readStep(branch);
		if (!step.ok) return step;
		if (step.value.type === "stop") break;

		items.push(step.value.item);
		branch = step.value.parentBranch;
	}
	return ok(items);
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
