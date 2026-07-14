import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import {
	commandSucceeded,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import {
	detectGitOperationInProgressAt,
	parseGitWorktreePorcelain,
	RealGitGateway,
	type GitGateway,
	type GitOperationInProgressFacts,
} from "@nseng-ai/foundation/git";
import { optionalEntry, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";

import {
	createSlotDiagnosticSinkFromEnv,
	runDiagnosticCommand,
	type SlotDiagnosticSink,
} from "../diagnostics.ts";

const SLOT_GIT_TIMEOUT_MS = 10_000;

export interface WorktreeInfo {
	path: string;
	branch: string | null;
}

export interface WorktreeOccupancy {
	path: string;
	branch: string | null;
	operation: string;
}

export interface LocalBranchTip {
	name: string;
	headIso: string | null;
}

export interface GitCommandFailure {
	message: string;
}

export interface BranchCommitSummary {
	sha: string;
	subject: string;
}

export interface BranchDiffFile {
	path: string;
	additions: number | null;
	deletions: number | null;
	binary: boolean;
}

export interface BranchDiffSummary {
	filesChanged: number;
	insertions: number;
	deletions: number;
	files: readonly BranchDiffFile[];
}

export interface BranchComparison {
	commits: readonly BranchCommitSummary[];
	diff: BranchDiffSummary;
}

export type BranchComparisonResult =
	| { type: "ok"; comparison: BranchComparison }
	| { type: "failure"; failure: GitCommandFailure };

export type CurrentBranchResult =
	| { type: "branch"; branch: string }
	| { type: "detached" }
	| { type: "failure"; failure: GitCommandFailure };

export interface BranchCreateOptions {
	shouldForce: boolean;
}

export interface BranchDeleteOptions {
	shouldForce: boolean;
}

export interface SlotRepositoryGateway {
	pathExists(path: string): Promise<boolean>;
	getGitCommonDir(cwd: string): Promise<string | null>;
	getRepositoryRoot(cwd: string): Promise<string>;
	listWorktrees(): Promise<readonly WorktreeInfo[]>;
	listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]>;
	listLocalBranches(): Promise<readonly string[]>;
	listLocalBranchTips(): Promise<readonly LocalBranchTip[]>;
	hasUncommittedChanges(path: string): Promise<boolean>;
	getTrunkBranch(): Promise<string>;
	getCurrentBranch(cwd: string): Promise<CurrentBranchResult>;
	getPreviousBranch(cwd: string): Promise<string | null>;
	branchExists(branch: string): Promise<boolean>;
	readBranchComparison(options: {
		parent: string;
		branch: string;
	}): Promise<BranchComparisonResult>;
	createBranch(
		branch: string,
		startPoint: string,
		options: BranchCreateOptions,
	): Promise<GitCommandFailure | null>;
	deleteLocalBranch(
		branch: string,
		options: BranchDeleteOptions,
	): Promise<GitCommandFailure | null>;
	checkoutBranch(cwd: string, branch: string): Promise<GitCommandFailure | null>;
	detachHead(cwd: string, ref: string): Promise<GitCommandFailure | null>;
	addDetachedWorktree(path: string, ref: string): Promise<void>;
	removeWorktree(path: string): Promise<void>;
}

export class RealSlotRepositoryGateway implements SlotRepositoryGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;
	private readonly coreGit: GitGateway;
	private readonly diagnosticSink: SlotDiagnosticSink | undefined;

	constructor(options: {
		cwd: string;
		env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
		execApi?: CommandExecApi;
		coreGit?: GitGateway;
		diagnosticSink?: ExplicitUndefined<"di-seam", SlotDiagnosticSink>;
	}) {
		this.cwd = options.cwd;
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
		this.coreGit = options.coreGit ?? new RealGitGateway(this.execApi);
		this.diagnosticSink = options.diagnosticSink ?? createSlotDiagnosticSinkFromEnv(this.env);
	}

	async pathExists(path: string): Promise<boolean> {
		return existsSync(path);
	}

	async getGitCommonDir(cwd: string): Promise<string | null> {
		const result = await this.coreGit.gitCommonDir({ cwd, env: this.env });
		return result.ok ? result.value : null;
	}

	async getRepositoryRoot(cwd: string): Promise<string> {
		const result = await this.coreGit.repoRoot({ cwd, env: this.env });
		if (result.ok) return result.value;
		throw new Error(result.error.message);
	}

	async listWorktrees(): Promise<readonly WorktreeInfo[]> {
		const result = await this.git(["worktree", "list", "--porcelain"], this.cwd, {
			operation: "slot.git.list_worktrees",
		});
		return parseGitWorktreePorcelain(result.result.stdout).map((worktree) => ({
			path: worktree.path,
			branch: worktree.branch,
		}));
	}

	async listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]> {
		const result = await this.git(["worktree", "list", "--porcelain"], this.cwd, {
			operation: "slot.git.list_branch_occupancies",
		});
		const occupancies = parseGitWorktreePorcelain(result.result.stdout).map((worktree) => {
			const operation = this.worktreeOperation(worktree.path);
			if (operation === null) {
				if (worktree.branch === null) return null;
				return { path: worktree.path, branch: worktree.branch, operation: "checked-out" };
			}
			return {
				path: worktree.path,
				branch: worktree.branch ?? operation.branch,
				operation: operation.operation,
			};
		});
		return occupancies.filter((occupancy) => occupancy !== null);
	}

	async listLocalBranches(): Promise<readonly string[]> {
		return (await this.listLocalBranchTips()).map((tip) => tip.name);
	}

	async listLocalBranchTips(): Promise<readonly LocalBranchTip[]> {
		const result = await this.coreGit.listLocalBranchTips({ cwd: this.cwd, env: this.env });
		if (result.ok) return result.value;
		throw new Error(result.error.message);
	}

	async hasUncommittedChanges(path: string): Promise<boolean> {
		const result = await this.coreGit.hasUncommittedChangesUnder({
			cwd: path,
			env: this.env,
			relativePath: ".",
		});
		if (result.ok) return result.value;
		throw new Error(result.error.message);
	}

	async getTrunkBranch(): Promise<string> {
		const result = await this.coreGit.trunkBranch({ cwd: this.cwd, env: this.env });
		if (result.type === "found") return result.value;
		if (result.type === "missing") return "master";
		throw new Error(result.error.message);
	}

	async getCurrentBranch(cwd: string): Promise<CurrentBranchResult> {
		const result = await this.coreGit.currentBranch({ cwd, env: this.env });
		if (result.type === "branch") return { type: "branch", branch: result.branch };
		if (result.type === "detached") return { type: "detached" };
		return { type: "failure", failure: { message: result.error.message } };
	}

	async getPreviousBranch(cwd: string): Promise<string | null> {
		const result = await this.coreGit.previousBranch({ cwd, env: this.env });
		return result.type === "found" ? result.value : null;
	}

	async branchExists(branch: string): Promise<boolean> {
		const result = await this.coreGit.localBranchPresence({
			cwd: this.cwd,
			env: this.env,
			branch,
		});
		if (result.type === "present") return true;
		if (result.type === "absent") return false;
		throw new Error(result.error.message);
	}

	async readBranchComparison(options: {
		parent: string;
		branch: string;
	}): Promise<BranchComparisonResult> {
		const refsResult = await this.git(
			[
				"show-ref",
				"--verify",
				"--hash",
				`refs/heads/${options.parent}`,
				`refs/heads/${options.branch}`,
			],
			this.cwd,
			{ allowFailure: true, operation: "slot.git.resolve_branch_comparison_refs" },
		);
		if (!refsResult.isOk) return { type: "failure", failure: failureFromResult(refsResult) };
		const refs = parseBranchComparisonOids(refsResult.result.stdout);
		if (refs.type === "failure") return refs;

		const [commitsResult, diffResult] = await Promise.all([
			this.git(
				["log", "--format=%H%x00%s%x00", `${refs.value.parent}..${refs.value.branch}`],
				this.cwd,
				{ allowFailure: true, operation: "slot.git.read_branch_commits" },
			),
			this.git(
				["diff", "--numstat", "--no-renames", "-z", `${refs.value.parent}...${refs.value.branch}`],
				this.cwd,
				{ allowFailure: true, operation: "slot.git.read_branch_diff" },
			),
		]);
		if (!commitsResult.isOk) return { type: "failure", failure: failureFromResult(commitsResult) };
		if (!diffResult.isOk) return { type: "failure", failure: failureFromResult(diffResult) };
		const commits = parseBranchCommitSummaries(commitsResult.result.stdout);
		if (commits.type === "failure") return commits;
		const diff = parseBranchDiffNumstat(diffResult.result.stdout);
		if (diff.type === "failure") return diff;
		return { type: "ok", comparison: { commits: commits.value, diff: diff.value } };
	}

	async createBranch(
		branch: string,
		startPoint: string,
		options: BranchCreateOptions,
	): Promise<GitCommandFailure | null> {
		const flag = options.shouldForce ? ["-f"] : [];
		const result = await this.git(["branch", ...flag, branch, startPoint], this.cwd, {
			allowFailure: true,
			operation: "slot.git.create_branch",
		});
		return result.isOk ? null : failureFromResult(result);
	}

	async deleteLocalBranch(
		branch: string,
		options: BranchDeleteOptions,
	): Promise<GitCommandFailure | null> {
		const flag = options.shouldForce ? "-D" : "-d";
		const result = await this.git(["branch", flag, branch], this.cwd, {
			allowFailure: true,
			operation: "slot.git.delete_local_branch",
		});
		return result.isOk ? null : failureFromResult(result);
	}

	async checkoutBranch(cwd: string, branch: string): Promise<GitCommandFailure | null> {
		const result = await this.git(["checkout", branch], cwd, {
			allowFailure: true,
			operation: "slot.git.checkout_branch",
		});
		return result.isOk ? null : failureFromResult(result);
	}

	async detachHead(cwd: string, ref: string): Promise<GitCommandFailure | null> {
		const result = await this.git(["checkout", "--detach", ref], cwd, {
			allowFailure: true,
			operation: "slot.git.detach_head",
		});
		return result.isOk ? null : failureFromResult(result);
	}

	async addDetachedWorktree(path: string, ref: string): Promise<void> {
		await this.git(["worktree", "add", "--detach", path, ref], this.cwd, {
			operation: "slot.git.add_detached_worktree",
		});
	}

	async removeWorktree(path: string): Promise<void> {
		await this.git(["worktree", "remove", path], this.cwd, {
			operation: "slot.git.remove_worktree",
		});
	}

	private worktreeOperation(worktreePath: string): GitOperationInProgressFacts | null {
		return detectGitOperationInProgressAt(worktreePath) ?? null;
	}

	private async git(
		args: readonly string[],
		cwd: string,
		options: { allowFailure?: boolean; operation?: string } = {},
	): Promise<CommandResult> {
		const result = await runDiagnosticCommand({
			execApi: this.execApi,
			command: "git",
			args,
			execOptions: { cwd, env: this.env, timeout: SLOT_GIT_TIMEOUT_MS },
			operation: options.operation ?? "slot.git.command",
			...optionalEntry("diagnosticSink", this.diagnosticSink),
		});
		const commandResult = { isOk: commandSucceeded(result), result };
		if (commandResult.isOk || options.allowFailure) return commandResult;
		throw new Error(`git ${args.join(" ")} failed: ${gitFailureMessage(result)}`);
	}
}

type ParsedValue<T> = { type: "ok"; value: T } | { type: "failure"; failure: GitCommandFailure };

function parseBranchComparisonOids(
	stdout: string,
): ParsedValue<{ parent: string; branch: string }> {
	const lines = stdout.endsWith("\n") ? stdout.slice(0, -1).split("\n") : stdout.split("\n");
	if (lines.length !== 2 || lines.some((line) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(line)))
		return {
			type: "failure",
			failure: { message: "git show-ref returned malformed branch comparison OIDs" },
		};
	const parent = lines[0];
	const branch = lines[1];
	if (parent === undefined || branch === undefined)
		return {
			type: "failure",
			failure: { message: "git show-ref returned incomplete branch comparison OIDs" },
		};
	return { type: "ok", value: { parent, branch } };
}

export function parseBranchCommitSummaries(
	stdout: string,
): ParsedValue<readonly BranchCommitSummary[]> {
	if (stdout === "") return { type: "ok", value: [] };
	const fields = stdout.split("\0");
	if (fields.at(-1) === "" || fields.at(-1) === "\n") fields.pop();
	if (fields.length % 2 !== 0)
		return {
			type: "failure",
			failure: { message: "git log returned malformed NUL-delimited commit records" },
		};
	const commits: BranchCommitSummary[] = [];
	for (let index = 0; index < fields.length; index += 2) {
		const rawSha = fields[index];
		const subject = fields[index + 1];
		if (rawSha === undefined || subject === undefined)
			return {
				type: "failure",
				failure: { message: "git log returned an incomplete commit record" },
			};
		const sha = rawSha.startsWith("\n") ? rawSha.slice(1) : rawSha;
		if (sha === "" || sha.includes("\n"))
			return {
				type: "failure",
				failure: { message: "git log returned an invalid commit SHA record" },
			};
		commits.push({ sha, subject });
	}
	return { type: "ok", value: commits };
}

export function parseBranchDiffNumstat(stdout: string): ParsedValue<BranchDiffSummary> {
	if (stdout === "")
		return { type: "ok", value: { filesChanged: 0, insertions: 0, deletions: 0, files: [] } };
	const records = stdout.split("\0");
	if (records.at(-1) === "") records.pop();
	const files: BranchDiffFile[] = [];
	let insertions = 0;
	let deletions = 0;
	for (const record of records) {
		const firstTab = record.indexOf("\t");
		const secondTab = record.indexOf("\t", firstTab + 1);
		if (firstTab <= 0 || secondTab <= firstTab + 1)
			return {
				type: "failure",
				failure: { message: "git diff returned malformed NUL-delimited numstat records" },
			};
		const additionsText = record.slice(0, firstTab);
		const deletionsText = record.slice(firstTab + 1, secondTab);
		const path = record.slice(secondTab + 1);
		const isBinary = additionsText === "-" && deletionsText === "-";
		if (
			path === "" ||
			(!isBinary && (!isUnsignedInteger(additionsText) || !isUnsignedInteger(deletionsText)))
		)
			return {
				type: "failure",
				failure: { message: "git diff returned an invalid numstat record" },
			};
		const additions = isBinary ? null : Number(additionsText);
		const fileDeletions = isBinary ? null : Number(deletionsText);
		insertions += additions ?? 0;
		deletions += fileDeletions ?? 0;
		files.push({ path, additions, deletions: fileDeletions, binary: isBinary });
	}
	return { type: "ok", value: { filesChanged: files.length, insertions, deletions, files } };
}

function isUnsignedInteger(value: string): boolean {
	return /^(?:0|[1-9]\d*)$/.test(value);
}

interface CommandResult {
	isOk: boolean;
	result: ExecResult;
}

function failureFromResult(commandResult: CommandResult): GitCommandFailure {
	return { message: gitFailureMessage(commandResult.result) };
}

function gitFailureMessage(result: ExecResult): string {
	const stderr = result.stderr.trim();
	if (stderr !== "") return stderr;
	const stdout = result.stdout.trim();
	if (stdout !== "") return stdout;
	switch (result.type) {
		case "spawn-failed":
			return `git failed to start: ${result.error}`;
		case "cancelled":
			return "git command was cancelled";
		case "timed-out":
			return "git command timed out";
		case "exited":
			return result.signal === null
				? `git exited with status ${result.code ?? "unknown"}`
				: `git exited after signal ${result.signal} (status ${result.code ?? "unknown"})`;
	}
}

export function mainRepoRootFromGitCommonDir(gitCommonDir: string): string {
	return dirname(gitCommonDir);
}
