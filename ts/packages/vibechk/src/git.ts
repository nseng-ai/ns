import {
	formatCommand,
	formatCommandFailure,
	NodeCommandExecApi,
	type CommandExecApi,
	type ExecResult,
} from "@asdl/core/exec";
import {
	RealGitGateway,
	type GitGateway,
	type GitOperationResult,
	type GitResult,
} from "@asdl/core/git";

import { VibechkError } from "./store.ts";

const GIT_TIMEOUT_MS = 10_000;

export interface GitProvenance {
	repoRoot: string;
	startingBranch: string;
	startingCommit: string;
	remotes: Record<string, string>;
}

export interface VibechkGitGateway {
	repoRoot(): Promise<string>;
	currentBranch(): Promise<string>;
	currentCommit(): Promise<string>;
	remotes(): Promise<Record<string, string>>;
	isClean(): Promise<boolean>;
	diffPatch(): Promise<string>;
	hasChanges(): Promise<boolean>;
	createResultBranchAndCommit(branch: string, message: string): Promise<void>;
	checkout(branch: string): Promise<void>;
}

export class RealVibechkGitGateway implements VibechkGitGateway {
	private readonly workdir: string;
	private readonly execApi: CommandExecApi;
	private readonly coreGit: GitGateway;

	constructor(workdir: string, execApi: CommandExecApi = new NodeCommandExecApi()) {
		this.workdir = workdir;
		this.execApi = execApi;
		this.coreGit = new RealGitGateway(execApi);
	}

	async repoRoot(): Promise<string> {
		const result = await this.coreGit.repoRoot({ cwd: this.workdir });
		return this.unwrapGitResult(result, `Workdir ${this.workdir} is not a git repository.`);
	}

	async currentBranch(): Promise<string> {
		const result = await this.coreGit.currentBranch({ cwd: this.workdir });
		if (result.type === "branch") return result.branch;
		if (result.type === "detached") {
			throw new VibechkError(
				`Could not determine current branch in ${this.workdir}\nDetached HEAD.`,
			);
		}
		if (isMissingExecutableError(result.error.message)) {
			throw new VibechkError("git is not installed or not on PATH.");
		}
		throw new VibechkError(
			`Could not determine current branch in ${this.workdir}\n${result.error.message}`,
		);
	}

	async currentCommit(): Promise<string> {
		const result = await this.coreGit.headCommit({ cwd: this.workdir });
		return this.unwrapGitResult(result, `Could not determine current commit in ${this.workdir}`);
	}

	async remotes(): Promise<Record<string, string>> {
		const output = await this.runGit(
			["remote", "-v"],
			`Could not list git remotes in ${this.workdir}`,
		);
		const remotes: Record<string, string> = {};
		for (const line of output.split("\n")) {
			const parts = line.split(/\s+/u);
			if (
				parts.length >= 2 &&
				parts[0] !== undefined &&
				parts[1] !== undefined &&
				!(parts[0] in remotes)
			) {
				remotes[parts[0]] = parts[1];
			}
		}
		return remotes;
	}

	async isClean(): Promise<boolean> {
		return !(await this.hasChanges());
	}

	async diffPatch(): Promise<string> {
		if (await this.hasChanges()) {
			await this.runGit(
				["add", "-N", "."],
				`Could not prepare untracked files for diff in ${this.workdir}`,
			);
		}
		return await this.runGit(
			["diff", "--binary", "HEAD"],
			`Could not capture git diff in ${this.workdir}`,
		);
	}

	async hasChanges(): Promise<boolean> {
		const result = await this.coreGit.hasUncommittedChangesUnder({
			cwd: this.workdir,
			relativePath: ".",
		});
		return this.unwrapGitResult(result, `Could not read git status in ${this.workdir}`);
	}

	async createResultBranchAndCommit(branch: string, message: string): Promise<void> {
		const branchResult = await this.coreGit.createBranchAtHead({ cwd: this.workdir, branch });
		this.unwrapGitOperationResult(branchResult, `Could not create result branch ${branch}`);
		await this.runGit(["switch", branch], `Could not switch to result branch ${branch}`);
		await this.runGit(["add", "-A"], `Could not stage vibechk changes on ${branch}`);
		await this.runGit(["commit", "-m", message], `Could not commit vibechk changes on ${branch}`);
	}

	async checkout(branch: string): Promise<void> {
		await this.runGit(["switch", branch], `Could not switch back to branch ${branch}`);
	}

	private unwrapGitResult<T>(result: GitResult<T>, errorMessage: string): T {
		if (result.ok) return result.value;
		if (isMissingExecutableError(result.error.message)) {
			throw new VibechkError("git is not installed or not on PATH.");
		}
		throw new VibechkError(`${errorMessage}\n${result.error.message}`);
	}

	private unwrapGitOperationResult(result: GitOperationResult, errorMessage: string): void {
		if (result.ok) return;
		if (isMissingExecutableError(result.error.message)) {
			throw new VibechkError("git is not installed or not on PATH.");
		}
		throw new VibechkError(`${errorMessage}\n${result.error.message}`);
	}

	private async runGit(args: readonly string[], errorMessage: string): Promise<string> {
		const result = await this.runGitRaw(args);
		if (result.code !== 0 || result.killed) {
			throw new VibechkError(
				formatCommandFailure(errorMessage, formatCommand("git", args), result),
			);
		}
		return result.stdout.trim();
	}

	private async runGitRaw(args: readonly string[]): Promise<ExecResult> {
		let result: ExecResult;
		try {
			result = await this.execApi.exec("git", [...args], {
				cwd: this.workdir,
				timeout: GIT_TIMEOUT_MS,
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (isMissingExecutableError(message)) {
				throw new VibechkError("git is not installed or not on PATH.");
			}
			throw new VibechkError(`git command failed before completion: ${message}`);
		}
		if (result.startupError !== undefined) {
			if (isMissingExecutableError(result.startupError)) {
				throw new VibechkError("git is not installed or not on PATH.");
			}
			throw new VibechkError(`git command failed before completion: ${result.startupError}`);
		}
		return result;
	}
}

function isMissingExecutableError(message: string): boolean {
	return message.includes("ENOENT");
}
