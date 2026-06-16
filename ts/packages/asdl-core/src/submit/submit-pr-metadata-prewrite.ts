import { runCommand, stripTerminalEscapes, type CommandRunner, type ExecResult } from "../exec.ts";
import type { GitGateway } from "../git/index.ts";

import { commandFailure } from "./command-failure.ts";
import type { PrCommitMessage } from "./github-pr-gateway.ts";
import { extractPrLinks, type SubmitPrLink } from "./gt-output.ts";
import { preparePrDescription, resolvePrDescriptionGeneration, type PromptSource } from "./pr-description.ts";
import { err, ok, type ErrorInfo, type GatewayResult } from "./result.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

const GT_LOG_STACK_ARGS = ["log", "--stack", "--reverse", "--no-interactive"] as const;
const GT_BRANCH_INFO_BASE_ARGS = ["branch", "info", "--no-interactive", "--branch"] as const;
const GT_MODIFY_BASE_ARGS = ["modify", "--no-interactive"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const COMMAND_TIMEOUT_MS = 60_000;
const MODIFY_TIMEOUT_MS = 600_000;

export type SubmitMetadataProgressListener = (message: string) => void;

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

export interface SubmitMetadataGateway {
	inspectSubmitStack(params: SubmitMetadataCommandParams): Promise<GatewayResult<SubmitStackInspection>>;
	ensureCleanWorktree(params: SubmitMetadataCommandParams): Promise<GatewayResult<void>>;
	amendBranchMetadataCommit(params: { cwd: string; currentBranch: string; branch: string; title: string; body: string }): Promise<GatewayResult<void>>;
}

export interface PreparedSubmitPrMetadata {
	branch: string;
	parentBranch: string;
	title: string;
	body: string;
	commitRange: string;
	promptSource: PromptSource;
}

export type SubmitPrMetadataPrewriteResult =
	| { kind: "prepared"; prepared: PreparedSubmitPrMetadata[] }
	| { kind: "failed"; error: string; exitCode?: number; amendedBranches: string[] };

export class RealSubmitMetadataGateway implements SubmitMetadataGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async inspectSubmitStack(params: SubmitMetadataCommandParams): Promise<GatewayResult<SubmitStackInspection>> {
		const log = await this.runGt([...GT_LOG_STACK_ARGS], params.cwd, COMMAND_TIMEOUT_MS);
		const logError = commandError("gt", GT_LOG_STACK_ARGS, log, "submit_stack_inspection_failed", "Could not inspect the Graphite submit stack.");
		if (logError !== undefined) return err(logError);

		const parsedLog = parseGtLogStack(log.stdout);
		if (parsedLog.branches.length === 0) {
			return err({ code: "submit_stack_empty", message: "Graphite stack inspection did not return any branches." });
		}
		if (parsedLog.currentBranch === undefined) {
			return err({ code: "submit_stack_current_unknown", message: "Graphite stack inspection did not identify the current branch." });
		}

		params.onProgress?.(`inspecting Graphite stack branch metadata for ${formatCount(parsedLog.branches.length, "branch")}`);
		const branches: SubmitStackBranch[] = [];
		for (const [index, branch] of parsedLog.branches.entries()) {
			params.onProgress?.(`inspecting PR metadata for ${branch} (${index + 1}/${parsedLog.branches.length})`);
			const info = await this.runGt([...GT_BRANCH_INFO_BASE_ARGS, branch], params.cwd, COMMAND_TIMEOUT_MS);
			const infoError = commandError("gt", [...GT_BRANCH_INFO_BASE_ARGS, branch], info, "submit_branch_info_failed", `Could not inspect Graphite branch ${branch}.`);
			if (infoError !== undefined) return err(infoError);

			const parentBranch = parseParentBranch(info.stdout);
			if (parentBranch === undefined) {
				continue;
			}

			const existingPr = parseExistingPrFromBranchInfo(`${info.stdout}\n${info.stderr}`, branch);
			if (!existingPr.ok) return existingPr;
			if (existingPr.value !== undefined) {
				branches.push({ kind: "existing", branch, parentBranch, pr: existingPr.value });
				continue;
			}

			params.onProgress?.(`reading local commits and diff for ${branch}`);
			const commitMessages = await this.readBranchCommitMessages(params.cwd, parentBranch, branch);
			if (!commitMessages.ok) return commitMessages;
			const diff = await this.readBranchDiff(params.cwd, parentBranch, branch);
			if (!diff.ok) return diff;

			branches.push({
				kind: "new",
				branch,
				parentBranch,
				commitMessages: commitMessages.value,
				diff: diff.value,
			});
		}

		return ok({ currentBranch: parsedLog.currentBranch, branches });
	}

	async ensureCleanWorktree(params: SubmitMetadataCommandParams): Promise<GatewayResult<void>> {
		const result = await this.runGit([...GIT_STATUS_PORCELAIN_ARGS], params.cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError("git", GIT_STATUS_PORCELAIN_ARGS, result, "submit_metadata_clean_check_failed", "Could not verify that the worktree is clean before amending PR metadata.");
		if (resultError !== undefined) return err(resultError);
		if (result.stdout.trim() !== "") {
			return err({
				code: "submit_metadata_dirty_worktree",
				message: "Worktree became dirty before PR metadata amendment. Submission was not attempted.",
			});
		}
		return ok(undefined);
	}

	async amendBranchMetadataCommit(params: { cwd: string; currentBranch: string; branch: string; title: string; body: string }): Promise<GatewayResult<void>> {
		const args = params.currentBranch === params.branch
			? [...GT_MODIFY_BASE_ARGS, "-m", params.title, "-m", params.body]
			: [...GT_MODIFY_BASE_ARGS, "--into", params.branch, "-m", params.title, "-m", params.body];
		const result = await this.runGt(args, params.cwd, MODIFY_TIMEOUT_MS);
		const resultError = commandError("gt", args, result, "submit_metadata_amend_failed", `Could not amend local PR metadata commit for ${params.branch}.`);
		if (resultError !== undefined) return err(resultError);
		return ok(undefined);
	}

	private async readBranchCommitMessages(cwd: string, parentBranch: string, branch: string): Promise<GatewayResult<PrCommitMessage[]>> {
		const args = ["log", "--format=%B%x00", `${parentBranch}..${branch}`];
		const result = await this.runGit(args, cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError("git", args, result, "submit_branch_commits_failed", `Could not read commits for ${branch}.`);
		if (resultError !== undefined) return err(resultError);
		return ok(parseCommitMessages(result.stdout));
	}

	private async readBranchDiff(cwd: string, parentBranch: string, branch: string): Promise<GatewayResult<string>> {
		const args = ["diff", `${parentBranch}..${branch}`];
		const result = await this.runGit(args, cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError("git", args, result, "submit_branch_diff_failed", `Could not read diff for ${branch}.`);
		if (resultError !== undefined) return err(resultError);
		return ok(result.stdout);
	}

	private async runGt(args: string[], cwd: string, timeoutMs: number): Promise<ExecResult> {
		return this.runner("gt", args, { cwd, timeout: timeoutMs });
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
	textGeneration: TextGenerationGateway;
	onProgress?: SubmitMetadataProgressListener;
}): Promise<SubmitPrMetadataPrewriteResult> {
	input.onProgress?.("inspecting Graphite stack before metadata preparation");
	const inspected = await input.gateway.inspectSubmitStack({ cwd: input.cwd, ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }) });
	if (!inspected.ok) {
		return { kind: "failed", error: inspected.error.message, amendedBranches: [] };
	}

	const amendableBranches = findAmendableBranchNames(inspected.value);
	const newBranches = inspected.value.branches.filter(
		(branch): branch is SubmitStackNewBranch => branch.kind === "new" && branch.commitMessages.length === 1 && amendableBranches.has(branch.branch),
	);
	input.onProgress?.(
		`found ${formatCount(inspected.value.branches.length, "stack branch")}; ${formatCount(newBranches.length, "new single-commit branch")} ${newBranches.length === 1 ? "needs" : "need"} initial PR metadata`,
	);
	if (newBranches.length === 0) {
		input.onProgress?.("no pre-submit PR metadata changes needed");
		return { kind: "prepared", prepared: [] };
	}

	const generated = await generateMetadataForBranches({
		cwd: input.cwd,
		env: input.env,
		git: input.git,
		textGeneration: input.textGeneration,
		branches: newBranches,
		...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
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
		input.onProgress?.(`amending local PR metadata commit for ${metadata.branch} (${index + 1}/${generated.prepared.length})`);
		const amended = await input.gateway.amendBranchMetadataCommit({
			cwd: input.cwd,
			currentBranch: inspected.value.currentBranch,
			branch: metadata.branch,
			title: metadata.title,
			body: metadata.body,
		});
		if (!amended.ok) {
			return {
				kind: "failed",
				error: `Could not amend local PR metadata for ${metadata.branch}: ${amended.error.message}. Submission was not attempted.${amendedBranches.length === 0 ? "" : " Earlier branches may already have amended commit messages."}`,
				amendedBranches,
			};
		}
		amendedBranches.push(metadata.branch);
	}

	input.onProgress?.(`prepared pre-submit PR metadata for ${formatCount(generated.prepared.length, "branch")}`);
	return { kind: "prepared", prepared: generated.prepared };
}

async function generateMetadataForBranches(input: {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	textGeneration: TextGenerationGateway;
	branches: readonly SubmitStackNewBranch[];
	onProgress?: SubmitMetadataProgressListener;
}): Promise<{ kind: "prepared"; prepared: PreparedSubmitPrMetadata[] } | { kind: "failed"; error: string; exitCode?: number }> {
	const generation = await resolvePrDescriptionGeneration({ env: input.env, cwd: input.cwd, git: input.git });
	if (!generation.ok) {
		return { kind: "failed", error: generation.error, ...(generation.exitCode === undefined ? {} : { exitCode: generation.exitCode }) };
	}

	const prepared: PreparedSubmitPrMetadata[] = [];
	for (const [index, branch] of input.branches.entries()) {
		input.onProgress?.(`generating initial PR metadata for ${branch.branch} (${index + 1}/${input.branches.length})`);
		const currentTitle = branch.commitMessages[0]?.headline ?? branch.branch;
		const generated = await preparePrDescription({
			textGeneration: input.textGeneration,
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
			return { kind: "failed", error: `Could not generate initial PR metadata for ${branch.branch}: ${generated.error}` };
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

function findAmendableBranchNames(inspection: SubmitStackInspection): Set<string> {
	const byBranch = new Map(inspection.branches.map((branch) => [branch.branch, branch]));
	const amendable = new Set<string>();
	let branchName: string | undefined = inspection.currentBranch;
	while (branchName !== undefined && !amendable.has(branchName)) {
		amendable.add(branchName);
		branchName = byBranch.get(branchName)?.parentBranch;
	}
	return amendable;
}

function commandError(command: string, args: readonly string[], result: ExecResult, code: string, message: string): ErrorInfo | undefined {
	return commandFailure({ command, args, result, code, message });
}

function formatCount(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "es"}`;
}

function parseExistingPrFromBranchInfo(output: string, branch: string): GatewayResult<SubmitPrLink | undefined> {
	const link = extractPrLinks(output)[0];
	if (link !== undefined) return ok(link);

	if (/^\s*PR\s+#\d+\b/im.test(stripTerminalEscapes(output))) {
		return err({ code: "submit_existing_pr_link_missing", message: `Graphite reported an existing PR for ${branch}, but no PR URL was detected.` });
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
	const match = stripTerminalEscapes(output).replace(/\r/g, "\n").match(/^Parent:\s*(\S+)\s*$/m);
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
