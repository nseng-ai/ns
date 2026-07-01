import { runCommand, formatCommand, formatCommandFailure } from "@sdl/exec";
import type { CommandRunner, ExecResult } from "@sdl/core/command";
import type { ErrorInfo } from "@sdl/core/result";
import { commandFailure } from "@sdl/capability-kit/gateway-result";
import { GRAPHITE_COMMAND_NAME, runGraphiteCommand } from "@sdl/graphite/branch";

const GIT_TIMEOUT_MS = 10_000;
const GT_TIMEOUT_MS = 30_000;
const FORMAT_TIMEOUT_MS = 120_000;
const SUBMIT_TIMEOUT_MS = 120_000;

export type AutopilotErrorInfo = ErrorInfo;

export type AutopilotResult<T> = { ok: true; value: T } | { ok: false; error: AutopilotErrorInfo };
export type AutopilotOperationResult = { ok: true } | { ok: false; error: AutopilotErrorInfo };

export interface AutopilotCwdParams {
	cwd: string;
}

export interface AutopilotStageParams extends AutopilotCwdParams {
	files: readonly string[];
}

export interface AutopilotBranchParams extends AutopilotCwdParams {
	branch: string;
}

export interface AutopilotMessageParams extends AutopilotCwdParams {
	message: string;
}

/**
 * Narrow, package-local seam for the handful of raw `git`/`gt`/`just`/`sdl` invocations the
 * autopilot land-slice safety boundary needs that the shared `GitGateway`/`GraphiteBranchGateway`
 * contracts do not expose (uncommitted-path listing, `diff --check`, `gt modify`). Mirrors
 * `RealSubmitMetadataGateway` in capabilities/flow: package-local interface + `CommandRunner`-backed
 * Real implementation, results-as-values throughout.
 */
export interface AutopilotGateway {
	uncommittedChangedPaths(params: AutopilotCwdParams): Promise<AutopilotResult<readonly string[]>>;
	diffCheck(params: AutopilotCwdParams): Promise<AutopilotOperationResult>;
	graphiteBranchTracked(params: AutopilotBranchParams): Promise<AutopilotOperationResult>;
	stageFiles(params: AutopilotStageParams): Promise<AutopilotOperationResult>;
	graphiteModify(params: AutopilotMessageParams): Promise<AutopilotResult<string>>;
	commit(params: AutopilotMessageParams): Promise<AutopilotResult<string>>;
	formatCheck(params: AutopilotCwdParams): Promise<AutopilotOperationResult>;
	formatFix(params: AutopilotCwdParams): Promise<AutopilotOperationResult>;
	submit(params: AutopilotCwdParams): Promise<AutopilotResult<string>>;
}

interface RunCheckedOptions {
	command: string;
	args: readonly string[];
	code: string;
	message: string;
	run: () => Promise<ExecResult>;
}

export class RealAutopilotGateway implements AutopilotGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async uncommittedChangedPaths(
		params: AutopilotCwdParams,
	): Promise<AutopilotResult<readonly string[]>> {
		const args = ["status", "--porcelain=v1"];
		const result = await this.runChecked({
			command: "git",
			args,
			code: "autopilot_status_failed",
			message: "Could not read git status.",
			run: () => this.runGit(args, params.cwd, GIT_TIMEOUT_MS),
		});
		if (!result.ok) return result;
		return { ok: true, value: parseGitStatusPaths(result.value.stdout) };
	}

	async diffCheck(params: AutopilotCwdParams): Promise<AutopilotOperationResult> {
		const args = ["diff", "--check"];
		const result = await this.runChecked({
			command: "git",
			args,
			code: "autopilot_diff_check_failed",
			message: "git diff --check reported whitespace errors or unresolved conflict markers.",
			run: () => this.runGit(args, params.cwd, GIT_TIMEOUT_MS),
		});
		if (!result.ok) return result;
		return { ok: true };
	}

	async graphiteBranchTracked(params: AutopilotBranchParams): Promise<AutopilotOperationResult> {
		// Canonical exit-code tracked-check, matching RealGraphiteBranchGateway.checkBranchTracked
		// (@sdl/graphite/branch). `gt info <branch> --no-interactive` exits non-zero on an untracked
		// branch; we never parse its display output. Avoids the boundary-doc-flagged `gt branch info`.
		const args = ["info", params.branch, "--no-interactive"];
		const result = await this.runChecked({
			command: GRAPHITE_COMMAND_NAME,
			args,
			code: "autopilot_branch_untracked",
			message: "Current branch is not tracked by Graphite.",
			run: () => this.runGt(args, params.cwd, GT_TIMEOUT_MS),
		});
		if (!result.ok) return result;
		return { ok: true };
	}

	async stageFiles(params: AutopilotStageParams): Promise<AutopilotOperationResult> {
		const args = ["add", "--", ...params.files];
		const result = await this.runChecked({
			command: "git",
			args,
			code: "autopilot_stage_failed",
			message: "Could not stage changed files.",
			run: () => this.runGit(args, params.cwd, GIT_TIMEOUT_MS),
		});
		if (!result.ok) return result;
		return { ok: true };
	}

	async graphiteModify(params: AutopilotMessageParams): Promise<AutopilotResult<string>> {
		const args = ["modify", "--no-interactive", "-m", params.message];
		const result = await this.runChecked({
			command: GRAPHITE_COMMAND_NAME,
			args,
			code: "autopilot_gt_modify_failed",
			message: "gt modify failed.",
			run: () => this.runGt(args, params.cwd, GT_TIMEOUT_MS),
		});
		if (!result.ok) return result;
		return { ok: true, value: result.value.stdout.trim() };
	}

	async commit(params: AutopilotMessageParams): Promise<AutopilotResult<string>> {
		const args = ["commit", "-m", params.message];
		const result = await this.runChecked({
			command: "git",
			args,
			code: "autopilot_commit_failed",
			message: "git commit failed.",
			run: () => this.runGit(args, params.cwd, GIT_TIMEOUT_MS),
		});
		if (!result.ok) return result;
		return { ok: true, value: result.value.stdout.trim() };
	}

	async formatCheck(params: AutopilotCwdParams): Promise<AutopilotOperationResult> {
		const args = ["ts-format-check"];
		const result = await this.runChecked({
			command: "just",
			args,
			code: "autopilot_format_check_failed",
			message: "just ts-format-check failed.",
			run: () => this.runJust(args, params.cwd),
		});
		if (!result.ok) return result;
		return { ok: true };
	}

	async formatFix(params: AutopilotCwdParams): Promise<AutopilotOperationResult> {
		const args = ["ts-format-fix"];
		const result = await this.runChecked({
			command: "just",
			args,
			code: "autopilot_format_fix_failed",
			message: "just ts-format-fix failed.",
			run: () => this.runJust(args, params.cwd),
		});
		if (!result.ok) return result;
		return { ok: true };
	}

	async submit(params: AutopilotCwdParams): Promise<AutopilotResult<string>> {
		const args = ["flow", "submit", "--no-restack"];
		const result = await this.runChecked({
			command: "sdl",
			args,
			code: "autopilot_submit_failed",
			message: "sdl flow submit failed.",
			run: () => this.runner("sdl", args, { cwd: params.cwd, timeout: SUBMIT_TIMEOUT_MS }),
		});
		if (!result.ok) return result;
		return { ok: true, value: result.value.stdout };
	}

	private async runChecked(options: RunCheckedOptions): Promise<AutopilotResult<ExecResult>> {
		const result = await options.run();
		const error = commandError(
			options.command,
			options.args,
			result,
			options.code,
			options.message,
		);
		if (error !== undefined) return { ok: false, error };
		return { ok: true, value: result };
	}

	private async runGit(
		args: readonly string[],
		cwd: string,
		timeoutMs: number,
	): Promise<ExecResult> {
		return this.runner("git", args, { cwd, timeout: timeoutMs });
	}

	private async runGt(
		args: readonly string[],
		cwd: string,
		timeoutMs: number,
	): Promise<ExecResult> {
		return runGraphiteCommand(this.runner, { cwd, args, timeoutMs });
	}

	private async runJust(args: readonly string[], cwd: string): Promise<ExecResult> {
		return this.runner("just", args, { cwd, timeout: FORMAT_TIMEOUT_MS });
	}
}

function commandError(
	command: string,
	args: readonly string[],
	result: ExecResult,
	code: string,
	message: string,
): AutopilotErrorInfo | undefined {
	const error = commandFailure({ command, args, result, code, message });
	if (error === undefined) return undefined;
	const displayCommand = formatCommand(command, args);
	return {
		...error,
		message: formatCommandFailure(message, displayCommand, result),
		displayCommand,
	};
}

function parseGitStatusPaths(rawStatus: string): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();
	for (const line of rawStatus.split(/\r?\n/)) {
		if (line === "") continue;
		if (line.length < 4 || line[2] !== " ") continue;
		const status = line.slice(0, 2);
		const payload = line.slice(3);
		if (payload === "") continue;
		const isRenameOrCopy = status.includes("R") || status.includes("C");
		const pathspec =
			isRenameOrCopy && payload.includes(" -> ")
				? payload.slice(payload.lastIndexOf(" -> ") + " -> ".length)
				: payload;
		if (!seen.has(pathspec)) {
			seen.add(pathspec);
			paths.push(pathspec);
		}
	}
	return paths;
}
