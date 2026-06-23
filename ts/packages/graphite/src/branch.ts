import {
	formatCommand,
	formatCommandFailure,
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
} from "@sdl/core/exec";

export const GRAPHITE_COMMAND_NAME = "gt";

const GT_TIMEOUT_MS = 30_000;

export interface GraphiteTrackBranchParams {
	cwd: string;
	branch: string;
	parentBranch: string;
	signal?: AbortSignal | undefined;
}

export interface GraphiteCheckBranchTrackedParams {
	cwd: string;
	branch: string;
	signal?: AbortSignal | undefined;
}

export interface GraphiteErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type GraphiteOperationResult = { ok: true } | { ok: false; error: GraphiteErrorInfo };

export type GraphiteBranchTrackedResult =
	| { ok: true; tracked: true }
	| { ok: true; tracked: false; detail: string }
	| { ok: false; error: GraphiteErrorInfo };

export interface GraphiteBranchGateway {
	checkBranchTracked(
		params: GraphiteCheckBranchTrackedParams,
	): Promise<GraphiteBranchTrackedResult>;
	trackBranch(params: GraphiteTrackBranchParams): Promise<GraphiteOperationResult>;
}

export interface GraphiteCommandRunParams {
	cwd: string;
	args: readonly string[];
	timeoutMs?: number | undefined;
	signal?: AbortSignal | undefined;
}

export interface GraphiteCommandExecApi<TResult> {
	exec(command: string, args: string[], options?: ExecOptions): Promise<TResult>;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

export class RealGraphiteBranchGateway implements GraphiteBranchGateway {
	private readonly pi: CommandExecApi;

	constructor(pi: CommandExecApi) {
		this.pi = pi;
	}

	async checkBranchTracked(
		params: GraphiteCheckBranchTrackedParams,
	): Promise<GraphiteBranchTrackedResult> {
		const args = ["info", params.branch, "--no-interactive"];
		const displayCommand = formatCommand("gt", args);
		let result: ExecResult;
		try {
			result = await this.pi.exec(
				"gt",
				args,
				execOptions(params.cwd, GT_TIMEOUT_MS, params.signal),
			);
		} catch (caught) {
			return { ok: false, error: startupFailure(displayCommand, caught) };
		}

		if (result.code !== 0 || result.killed) {
			return {
				ok: true,
				tracked: false,
				detail: formatCommandFailure(
					"gt info could not verify Graphite tracking",
					displayCommand,
					result,
				),
			};
		}
		return { ok: true, tracked: true };
	}

	async trackBranch(params: GraphiteTrackBranchParams): Promise<GraphiteOperationResult> {
		const args = ["track", params.branch, "--parent", params.parentBranch, "--no-interactive"];
		const displayCommand = formatCommand("gt", args);
		let result: ExecResult;
		try {
			result = await this.pi.exec(
				"gt",
				args,
				execOptions(params.cwd, GT_TIMEOUT_MS, params.signal),
			);
		} catch (caught) {
			return { ok: false, error: startupFailure(displayCommand, caught) };
		}

		if (result.code !== 0 || result.killed) {
			return {
				ok: false,
				error: failure("graphite_track_failed", "gt track failed", { result, displayCommand }),
			};
		}
		return { ok: true };
	}
}

export function runGraphiteCommand<TResult>(
	api: GraphiteCommandExecApi<TResult>,
	params: GraphiteCommandRunParams,
): Promise<TResult> {
	return api.exec(
		GRAPHITE_COMMAND_NAME,
		[...params.args],
		execOptions(params.cwd, params.timeoutMs ?? GT_TIMEOUT_MS, params.signal),
	);
}

function startupFailure(displayCommand: string, caught: unknown): GraphiteErrorInfo {
	const message = caught instanceof Error ? caught.message : String(caught);
	return {
		code: "graphite_startup_failed",
		message: `gt command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`,
		displayCommand,
	};
}

function failure(code: string, title: string, run: CommandRun): GraphiteErrorInfo {
	return {
		code,
		message: formatCommandFailure(title, run.displayCommand, run.result),
		displayCommand: run.displayCommand,
	};
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}
