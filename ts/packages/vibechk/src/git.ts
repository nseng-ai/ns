import {
	formatCommand,
	formatCommandFailure,
	NodeCommandExecApi,
	type CommandExecApi,
	type ExecResult,
} from "@asdl/core/exec";

import { VibechkError } from "./store.ts";

const GIT_TIMEOUT_MS = 10_000;

export interface GitProvenance {
	repoRoot: string;
	startingBranch: string;
	startingCommit: string;
	remotes: Record<string, string>;
}

export interface GitGateway {
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

export class RealGitGateway implements GitGateway {
	private readonly workdir: string;
	private readonly execApi: CommandExecApi;

	constructor(workdir: string, execApi: CommandExecApi = new NodeCommandExecApi()) {
		this.workdir = workdir;
		this.execApi = execApi;
	}

	async repoRoot(): Promise<string> {
		const result = await this.runGitRaw(["rev-parse", "--show-toplevel"]);
		if (result.code !== 0 || result.killed) {
			throw new VibechkError(`Workdir ${this.workdir} is not a git repository.`);
		}
		const root = result.stdout.trim();
		if (root === "") {
			throw new VibechkError(`Workdir ${this.workdir} is not a git repository.`);
		}
		return root;
	}

	async currentBranch(): Promise<string> {
		const branch = await this.runGit(
			["rev-parse", "--abbrev-ref", "HEAD"],
			`Could not determine current branch in ${this.workdir}`,
		);
		if (branch === "HEAD") {
			throw new VibechkError(`Workdir ${this.workdir} is in detached HEAD state.`);
		}
		return branch;
	}

	async currentCommit(): Promise<string> {
		return await this.runGit(
			["rev-parse", "HEAD"],
			`Could not determine current commit in ${this.workdir}`,
		);
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
		const status = await this.statusPorcelain();
		return status === "";
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
		const status = await this.statusPorcelain();
		return status !== "";
	}

	async createResultBranchAndCommit(branch: string, message: string): Promise<void> {
		await this.runGit(["switch", "-c", branch], `Could not create result branch ${branch}`);
		await this.runGit(["add", "-A"], `Could not stage vibechk changes on ${branch}`);
		await this.runGit(["commit", "-m", message], `Could not commit vibechk changes on ${branch}`);
	}

	async checkout(branch: string): Promise<void> {
		await this.runGit(["switch", branch], `Could not switch back to branch ${branch}`);
	}

	private async statusPorcelain(): Promise<string> {
		return await this.runGit(
			["status", "--porcelain=v1"],
			`Could not read git status in ${this.workdir}`,
		);
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
