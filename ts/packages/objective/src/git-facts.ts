import { formatCommand, formatCommandFailure, type CommandExecApi, type ExecOptions } from "@asdl/core/exec";

const GIT_TIMEOUT_MS = 10_000;

export interface ObjectiveGitErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type ObjectiveGitResult<T> = { ok: true; value: T } | { ok: false; error: ObjectiveGitErrorInfo };

export interface ObjectiveRepoPathParams {
	repoRoot: string;
	relativePath: string;
	signal?: AbortSignal | undefined;
}

export interface ObjectiveRepoParams {
	repoRoot: string;
	signal?: AbortSignal | undefined;
}

export interface ObjectiveRefsPathParams extends ObjectiveRepoPathParams {
	refs: readonly string[];
}

export interface ObjectiveRevisionRangePathParams extends ObjectiveRepoPathParams {
	revisionRange: string;
}

export interface ObjectiveLocalBranchTip {
	name: string;
	headIso: string | null;
}

export interface ObjectivePathChangeTouch {
	paths: readonly string[];
}

export interface ObjectiveGitFactsGateway {
	hasUncommittedChangesUnder(params: ObjectiveRepoPathParams): Promise<ObjectiveGitResult<boolean>>;
	listLocalBranchTips(params: ObjectiveRepoParams): Promise<ObjectiveGitResult<readonly ObjectiveLocalBranchTip[]>>;
	treeOidsAtRefs(params: ObjectiveRefsPathParams): Promise<ObjectiveGitResult<Readonly<Record<string, string | null>>>>;
	pathTouchesUnder(params: ObjectiveRevisionRangePathParams): Promise<ObjectiveGitResult<readonly ObjectivePathChangeTouch[]>>;
}

export class RealObjectiveGitFactsGateway implements ObjectiveGitFactsGateway {
	private readonly execApi: CommandExecApi;

	constructor(execApi: CommandExecApi) {
		this.execApi = execApi;
	}

	async hasUncommittedChangesUnder(params: ObjectiveRepoPathParams): Promise<ObjectiveGitResult<boolean>> {
		const run = await this.runGit(params, ["status", "--porcelain", "--", params.relativePath]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return gitFailure("objective_dirty_status_failed", "git status for Objective record failed", run.value);
		}
		return { ok: true, value: run.value.result.stdout.trim().length > 0 };
	}

	async listLocalBranchTips(params: ObjectiveRepoParams): Promise<ObjectiveGitResult<readonly ObjectiveLocalBranchTip[]>> {
		const run = await this.runGit(params, ["for-each-ref", "--format=%(refname:short)%09%(committerdate:iso-strict)", "refs/heads"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return gitFailure("objective_branch_tips_failed", "git local branch tip listing failed", run.value);
		}
		return { ok: true, value: parseLocalBranchTips(run.value.result.stdout) };
	}

	async treeOidsAtRefs(params: ObjectiveRefsPathParams): Promise<ObjectiveGitResult<Readonly<Record<string, string | null>>>> {
		const values: Record<string, string | null> = {};
		for (const ref of params.refs) {
			const run = await this.runGit(params, ["rev-parse", `${ref}:${params.relativePath}`]);
			if (!run.ok) return run;
			if (run.value.result.killed) {
				return gitFailure("objective_tree_oid_failed", "git tree lookup for Objective root failed", run.value);
			}
			if (run.value.result.code === 0) {
				values[ref] = firstNonEmptyLine(run.value.result.stdout) ?? null;
				continue;
			}
			if (isMissingTreeResult(run.value.result.stdout, run.value.result.stderr)) {
				values[ref] = null;
				continue;
			}
			return gitFailure("objective_tree_oid_failed", "git tree lookup for Objective root failed", run.value);
		}
		return { ok: true, value: values };
	}

	async pathTouchesUnder(params: ObjectiveRevisionRangePathParams): Promise<ObjectiveGitResult<readonly ObjectivePathChangeTouch[]>> {
		const run = await this.runGit(params, ["diff", "--name-only", params.revisionRange, "--", params.relativePath]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return gitFailure("objective_path_touches_failed", "git path touch lookup for Objective root failed", run.value);
		}
		const paths = run.value.result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
		return { ok: true, value: paths.length === 0 ? [] : [{ paths }] };
	}

	private async runGit(params: ObjectiveRepoParams, args: string[]): Promise<{ ok: true; value: CommandRun } | { ok: false; error: ObjectiveGitErrorInfo }> {
		const displayCommand = formatCommand("git", args);
		try {
			const result = await this.execApi.exec("git", args, execOptions(params.repoRoot, params.signal));
			return { ok: true, value: { result, displayCommand } };
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			return {
				ok: false,
				error: {
					code: "objective_git_startup_failed",
					message: `git command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`,
					displayCommand,
				},
			};
		}
	}
}

export class CleanObjectiveGitFactsGateway implements ObjectiveGitFactsGateway {
	async hasUncommittedChangesUnder(_params: ObjectiveRepoPathParams): Promise<ObjectiveGitResult<boolean>> {
		return { ok: true, value: false };
	}

	async listLocalBranchTips(_params: ObjectiveRepoParams): Promise<ObjectiveGitResult<readonly ObjectiveLocalBranchTip[]>> {
		return { ok: true, value: [] };
	}

	async treeOidsAtRefs(params: ObjectiveRefsPathParams): Promise<ObjectiveGitResult<Readonly<Record<string, string | null>>>> {
		return { ok: true, value: Object.fromEntries(params.refs.map((ref) => [ref, null])) };
	}

	async pathTouchesUnder(_params: ObjectiveRevisionRangePathParams): Promise<ObjectiveGitResult<readonly ObjectivePathChangeTouch[]>> {
		return { ok: true, value: [] };
	}
}

interface CommandRun {
	result: Awaited<ReturnType<CommandExecApi["exec"]>>;
	displayCommand: string;
}

function execOptions(cwd: string, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) return { cwd, timeout: GIT_TIMEOUT_MS };
	return { cwd, timeout: GIT_TIMEOUT_MS, signal };
}

function gitFailure(code: string, title: string, run: CommandRun): { ok: false; error: ObjectiveGitErrorInfo } {
	return {
		ok: false,
		error: {
			code,
			message: formatCommandFailure(title, run.displayCommand, run.result),
			displayCommand: run.displayCommand,
		},
	};
}

function parseLocalBranchTips(stdout: string): ObjectiveLocalBranchTip[] {
	return stdout.split(/\r?\n/u).flatMap((line) => {
		if (line.trim().length === 0) return [];
		const [name, headIso] = line.split("\t", 2);
		if (name === undefined || name.length === 0) return [];
		return [{ name, headIso: headIso === undefined || headIso.length === 0 ? null : headIso }];
	});
}

function firstNonEmptyLine(value: string): string | null {
	return value.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0) ?? null;
}

function isMissingTreeResult(stdout: string, stderr: string): boolean {
	const output = `${stdout}\n${stderr}`;
	return output.includes("exists on disk, but not in") || output.includes("does not exist in") || output.includes("unknown revision or path");
}
