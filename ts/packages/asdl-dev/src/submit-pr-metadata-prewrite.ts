import { runCommand, type CommandRunner, type ExecResult } from "@asdl/core/exec";

import type { GitGateway } from "./gateways/git.ts";
import type { PrCommitMessage } from "./gateways/github-pr.ts";
import { preparePrDescription, resolvePrDescriptionPrompt, type PromptSource } from "./pr-description.ts";
import { err, ok, type ErrorInfo, type GatewayResult } from "./result.ts";
import type { SubmitPrDescriptionOptions, SubmitPrLink } from "./submit.ts";
import { selectPrDescriptionTextGenerationConfig, type TextGenerationGateway } from "./text-generation.ts";

const GT_LOG_STACK_ARGS = ["log", "--stack", "--reverse", "--no-interactive"] as const;
const GT_BRANCH_INFO_BASE_ARGS = ["branch", "info", "--no-interactive", "--branch"] as const;
const GT_PR_BASE_ARGS = ["pr", "--no-interactive"] as const;
const GT_MODIFY_BASE_ARGS = ["modify", "--no-interactive"] as const;
const GIT_CURRENT_BRANCH_ARGS = ["branch", "--show-current"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const COMMAND_TIMEOUT_MS = 60_000;
const MODIFY_TIMEOUT_MS = 600_000;

export interface SubmitMetadataCommandParams {
	cwd: string;
}

export interface SubmitStackBranchInspection {
	branch: string;
	parentBranch: string;
	currentTitle: string;
	commitCount: number;
	commitMessages: readonly PrCommitMessage[];
	diff: string;
	existingPr?: SubmitPrLink;
}

export interface SubmitStackInspection {
	branches: readonly SubmitStackBranchInspection[];
}

export interface SubmitMetadataGateway {
	inspectSubmitStack(params: SubmitMetadataCommandParams): Promise<GatewayResult<SubmitStackInspection>>;
	amendBranchMetadataCommit(params: { cwd: string; branch: string; title: string; body: string }): Promise<GatewayResult<void>>;
}

export interface PreparedSubmitPrMetadata {
	branch: string;
	parentBranch: string;
	title: string;
	body: string;
	commitRange: string;
	promptSource: PromptSource;
}

export interface SubmitPrMetadataSkip {
	branch: string;
	reason: string;
}

export type SubmitPrMetadataPrewriteResult =
	| { kind: "prepared"; prepared: PreparedSubmitPrMetadata[]; skipped: SubmitPrMetadataSkip[] }
	| { kind: "failed"; error: string; exitCode?: number; amendedBranches: string[] };

export class RealSubmitMetadataGateway implements SubmitMetadataGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async inspectSubmitStack(params: SubmitMetadataCommandParams): Promise<GatewayResult<SubmitStackInspection>> {
		const log = await this.runGt([...GT_LOG_STACK_ARGS], params.cwd, COMMAND_TIMEOUT_MS);
		const logError = commandError(log, "submit_stack_inspection_failed", "Could not inspect the Graphite submit stack.");
		if (logError !== undefined) return err(logError);

		const branchNames = parseGtLogStackBranches(log.stdout);
		const currentBranch = parseCurrentBranchFromGtLog(log.stdout);
		if (branchNames.length === 0) {
			return err({ code: "submit_stack_empty", message: "Graphite stack inspection did not return any branches." });
		}
		if (currentBranch === undefined) {
			return err({ code: "submit_stack_current_unknown", message: "Graphite stack inspection did not identify the current branch." });
		}

		const branches: SubmitStackBranchInspection[] = [];
		for (const branch of branchNames) {
			const info = await this.runGt([...GT_BRANCH_INFO_BASE_ARGS, branch], params.cwd, COMMAND_TIMEOUT_MS);
			const infoError = commandError(info, "submit_branch_info_failed", `Could not inspect Graphite branch ${branch}.`);
			if (infoError !== undefined) return err(infoError);

			const parentBranch = parseParentBranch(info.stdout);
			if (parentBranch === undefined) {
				continue;
			}

			const existingPr = await this.readExistingPr(params.cwd, branch);
			const commitMessages = await this.readBranchCommitMessages(params.cwd, parentBranch, branch);
			if (!commitMessages.ok) return commitMessages;
			const diff = await this.readBranchDiff(params.cwd, parentBranch, branch);
			if (!diff.ok) return diff;

			branches.push({
				branch,
				parentBranch,
				currentTitle: commitMessages.value[0]?.headline ?? branch,
				commitCount: commitMessages.value.length,
				commitMessages: commitMessages.value,
				diff: diff.value,
				...(existingPr === undefined ? {} : { existingPr }),
			});
		}

		return ok({ branches });
	}

	async amendBranchMetadataCommit(params: { cwd: string; branch: string; title: string; body: string }): Promise<GatewayResult<void>> {
		const clean = await this.ensureCleanWorktree(params.cwd);
		if (!clean.ok) return clean;

		const current = await this.currentBranch(params.cwd);
		if (!current.ok) return current;

		const args = current.value === params.branch
			? [...GT_MODIFY_BASE_ARGS, "-m", params.title, "-m", params.body]
			: [...GT_MODIFY_BASE_ARGS, "--into", params.branch, "-m", params.title, "-m", params.body];
		const result = await this.runGt(args, params.cwd, MODIFY_TIMEOUT_MS);
		const resultError = commandError(result, "submit_metadata_amend_failed", `Could not amend local PR metadata commit for ${params.branch}.`);
		if (resultError !== undefined) return err(resultError);
		return ok(undefined);
	}

	private async readExistingPr(cwd: string, branch: string): Promise<SubmitPrLink | undefined> {
		const result = await this.runGt([...GT_PR_BASE_ARGS, branch], cwd, COMMAND_TIMEOUT_MS);
		if (result.exitCode !== 0 || result.startupError !== undefined || result.killed === true) return undefined;
		return extractPrLinks(`${result.stdout}\n${result.stderr}`)[0];
	}

	private async readBranchCommitMessages(cwd: string, parentBranch: string, branch: string): Promise<GatewayResult<PrCommitMessage[]>> {
		const result = await this.runGit(["log", "--format=%B%x00", `${parentBranch}..${branch}`], cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError(result, "submit_branch_commits_failed", `Could not read commits for ${branch}.`);
		if (resultError !== undefined) return err(resultError);
		return ok(parseCommitMessages(result.stdout));
	}

	private async readBranchDiff(cwd: string, parentBranch: string, branch: string): Promise<GatewayResult<string>> {
		const result = await this.runGit(["diff", `${parentBranch}..${branch}`], cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError(result, "submit_branch_diff_failed", `Could not read diff for ${branch}.`);
		if (resultError !== undefined) return err(resultError);
		return ok(result.stdout);
	}

	private async ensureCleanWorktree(cwd: string): Promise<GatewayResult<void>> {
		const result = await this.runGit([...GIT_STATUS_PORCELAIN_ARGS], cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError(result, "submit_metadata_clean_check_failed", "Could not verify that the worktree is clean before amending PR metadata.");
		if (resultError !== undefined) return err(resultError);
		if (result.stdout.trim() !== "") {
			return err({
				code: "submit_metadata_dirty_worktree",
				message: "Worktree became dirty before PR metadata amendment. Submission was not attempted.",
			});
		}
		return ok(undefined);
	}

	private async currentBranch(cwd: string): Promise<GatewayResult<string>> {
		const result = await this.runGit([...GIT_CURRENT_BRANCH_ARGS], cwd, COMMAND_TIMEOUT_MS);
		const resultError = commandError(result, "branch_unresolved", "Could not resolve the current git branch before PR metadata amendment.");
		if (resultError !== undefined) return err(resultError);
		const branch = result.stdout.trim();
		if (branch === "") return err({ code: "detached_head", message: "Cannot amend PR metadata from a detached HEAD." });
		return ok(branch);
	}

	private async runGt(args: string[], cwd: string, timeoutMs: number): Promise<CommandOutput> {
		return toCommandOutput(await this.runner("gt", args, { cwd, timeout: timeoutMs }));
	}

	private async runGit(args: string[], cwd: string, timeoutMs: number): Promise<CommandOutput> {
		return toCommandOutput(await this.runner("git", args, { cwd, timeout: timeoutMs }));
	}
}

export async function prepareSubmitPrMetadata(input: {
	cwd: string;
	env: Record<string, string | undefined>;
	gateway: SubmitMetadataGateway;
	git: GitGateway;
	textGeneration: TextGenerationGateway;
}): Promise<SubmitPrMetadataPrewriteResult> {
	const inspected = await input.gateway.inspectSubmitStack({ cwd: input.cwd });
	if (!inspected.ok) {
		return { kind: "failed", error: inspected.error.message, amendedBranches: [] };
	}

	const skipped: SubmitPrMetadataSkip[] = inspected.value.branches
		.filter((branch) => branch.existingPr !== undefined)
		.map((branch) => ({ branch: branch.branch, reason: "PR already exists" }));
	const newBranches = inspected.value.branches.filter((branch) => branch.existingPr === undefined);
	if (newBranches.length === 0) {
		return { kind: "prepared", prepared: [], skipped };
	}

	for (const branch of newBranches) {
		if (branch.commitCount !== 1) {
			return {
				kind: "failed",
				error: `Could not prepare initial PR metadata for ${branch.branch}: branch has ${branch.commitCount} commits and Graphite's creation-time metadata source is ambiguous. Submission was not attempted. Squash/split the branch or run plain gt submit/asdl-dev pr-regen manually.`,
				amendedBranches: [],
			};
		}
	}

	const generated = await generateMetadataForBranches({
		cwd: input.cwd,
		env: input.env,
		git: input.git,
		textGeneration: input.textGeneration,
		branches: newBranches,
	});
	if (generated.kind === "failed") {
		return { ...generated, amendedBranches: [] };
	}

	const amendedBranches: string[] = [];
	for (const metadata of generated.prepared) {
		const amended = await input.gateway.amendBranchMetadataCommit({
			cwd: input.cwd,
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

	return { kind: "prepared", prepared: generated.prepared, skipped };
}

async function generateMetadataForBranches(input: {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	textGeneration: TextGenerationGateway;
	branches: readonly SubmitStackBranchInspection[];
}): Promise<{ kind: "prepared"; prepared: PreparedSubmitPrMetadata[] } | { kind: "failed"; error: string; exitCode?: number }> {
	const modelConfig = selectPrDescriptionTextGenerationConfig(input.env);
	if (!modelConfig.ok) {
		return { kind: "failed", error: modelConfig.error, exitCode: 2 };
	}

	const repoRoot = await input.git.repoRoot({ cwd: input.cwd });
	const prompt = await resolvePrDescriptionPrompt({
		env: input.env,
		cwd: input.cwd,
		...(repoRoot.ok ? { repoRoot: repoRoot.value } : {}),
	});
	if (!prompt.ok) {
		return { kind: "failed", error: prompt.error, exitCode: 2 };
	}

	const prepared: PreparedSubmitPrMetadata[] = [];
	for (const branch of input.branches) {
		const generated = await preparePrDescription({
			textGeneration: input.textGeneration,
			modelRef: modelConfig.value.modelRef,
			promptText: prompt.text,
			context: {
				kind: "local",
				title: branch.currentTitle,
				headRefName: branch.branch,
				baseRefName: branch.parentBranch,
				commitMessages: branch.commitMessages,
				diff: branch.diff,
			},
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
			promptSource: prompt.source,
		});
	}
	return { kind: "prepared", prepared };
}

interface CommandOutput {
	stdout: string;
	stderr: string;
	exitCode: number;
	startupError?: string;
	killed?: boolean;
}

function toCommandOutput(result: ExecResult): CommandOutput {
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.code,
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
		...(result.killed ? { killed: true } : {}),
	};
}

function commandError(output: CommandOutput, code: string, message: string): ErrorInfo | undefined {
	if (output.startupError !== undefined) {
		return { code, message: `${message}\n${output.startupError}` };
	}
	if (output.killed === true) {
		return { code, message: `${message}\nCommand timed out.` };
	}
	if (output.exitCode !== 0) {
		return { code, message: `${message}\n${formatCommandOutput(output)}` };
	}
	return undefined;
}

function formatCommandOutput(output: CommandOutput): string {
	return [`exit code ${output.exitCode}`, output.stdout.trim() === "" ? undefined : `stdout:\n${output.stdout.trimEnd()}`, output.stderr.trim() === "" ? undefined : `stderr:\n${output.stderr.trimEnd()}`]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

export function parseGtLogStackBranches(output: string): string[] {
	const branches: string[] = [];
	for (const line of stripAnsi(output).replace(/\r/g, "\n").split("\n")) {
		const match = line.match(/^[│\s]*[◉◯]\s+([^\s(]+)(?:\s+\((current)\))?/);
		if (match?.[1] === undefined) continue;
		branches.push(match[1]);
	}
	return branches;
}

export function parseCurrentBranchFromGtLog(output: string): string | undefined {
	for (const line of stripAnsi(output).replace(/\r/g, "\n").split("\n")) {
		const match = line.match(/^[│\s]*[◉◯]\s+([^\s(]+)\s+\(current\)/);
		if (match?.[1] !== undefined) return match[1];
	}
	return undefined;
}

export function parseParentBranch(output: string): string | undefined {
	const match = stripAnsi(output).replace(/\r/g, "\n").match(/^Parent:\s*(\S+)\s*$/m);
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

function extractPrLinks(output: string): SubmitPrLink[] {
	const links: SubmitPrLink[] = [];
	const seenUrls = new Set<string>();
	for (const match of stripAnsi(output).matchAll(/https?:\/\/[^\s<>"'\u0060]+/g)) {
		const url = trimTerminalPunctuation(match[0]);
		if (seenUrls.has(url)) continue;
		const prNumber = prNumberFromUrl(url);
		if (prNumber === undefined) continue;
		seenUrls.add(url);
		links.push({ label: `#${prNumber}`, url });
	}
	return links;
}

function prNumberFromUrl(url: string): string | undefined {
	const graphiteMatch = url.match(/^https:\/\/app\.graphite\.com\/github\/pr\/[^\/\s?#]+\/[^\/\s?#]+\/(\d+)(?:[\/?#].*)?$/);
	if (graphiteMatch?.[1] !== undefined) return graphiteMatch[1];
	const githubMatch = url.match(/^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\/(\d+)(?:[\/?#].*)?$/);
	return githubMatch?.[1];
}

function trimTerminalPunctuation(url: string): string {
	let trimmed = url;
	while (/[),.;:!?}\]]$/.test(trimmed)) {
		trimmed = trimmed.slice(0, -1);
	}
	return trimmed;
}

function stripAnsi(text: string): string {
	return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "");
}
