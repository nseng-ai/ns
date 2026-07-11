import { optionalEntries, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import {
	type CommandExecApi,
	type CommandRunner,
	commandSucceeded,
	execApiToCommandRunner,
	type ExecOptions,
	type ExecResult,
	formatCommand,
	formatCommandFailure,
} from "@nseng-ai/foundation/exec";

export const GRAPHITE_COMMAND_NAME = "gt";

const GT_TIMEOUT_MS = 30_000;

export interface GraphiteTrackBranchParams {
	cwd: string;
	branch: string;
	parentBranch: string;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface GraphiteCheckBranchTrackedParams {
	cwd: string;
	branch: string;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
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
	timeoutMs?: number;
	env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	onStdout?: (text: string) => void;
	onStderr?: (text: string) => void;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

export class RealGraphiteBranchGateway implements GraphiteBranchGateway {
	private readonly runner: CommandRunner;

	constructor(pi: CommandExecApi) {
		this.runner = execApiToCommandRunner(pi);
	}

	async checkBranchTracked(
		params: GraphiteCheckBranchTrackedParams,
	): Promise<GraphiteBranchTrackedResult> {
		const args = ["info", params.branch, "--no-interactive"];
		const displayCommand = formatCommand(GRAPHITE_COMMAND_NAME, args);
		let result: ExecResult;
		try {
			result = await runGraphiteCommand(this.runner, {
				cwd: params.cwd,
				args,
				signal: params.signal,
			});
		} catch (caught) {
			return { ok: false, error: startupFailure(displayCommand, caught) };
		}

		if (!commandSucceeded(result)) {
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
		const displayCommand = formatCommand(GRAPHITE_COMMAND_NAME, args);
		let result: ExecResult;
		try {
			result = await runGraphiteCommand(this.runner, {
				cwd: params.cwd,
				args,
				signal: params.signal,
			});
		} catch (caught) {
			return { ok: false, error: startupFailure(displayCommand, caught) };
		}

		if (!commandSucceeded(result)) {
			return {
				ok: false,
				error: failure("graphite-track-failed", "gt track failed", { result, displayCommand }),
			};
		}
		return { ok: true };
	}
}

export function runGraphiteCommand(
	runner: CommandRunner,
	params: GraphiteCommandRunParams,
): Promise<ExecResult> {
	return runner(
		GRAPHITE_COMMAND_NAME,
		[...params.args],
		execOptions({
			cwd: params.cwd,
			timeout: params.timeoutMs ?? GT_TIMEOUT_MS,
			env: params.env,
			signal: params.signal,
			...optionalEntries({ onStdout: params.onStdout, onStderr: params.onStderr }),
		}),
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

function execOptions(options: {
	cwd: string;
	timeout: number;
	env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	onStdout?: (text: string) => void;
	onStderr?: (text: string) => void;
}): ExecOptions {
	const { cwd, timeout, env, signal, onStdout, onStderr } = options;
	return {
		cwd,
		timeout,
		...optionalEntries({ env, signal, onStdout, onStderr }),
	};
}
