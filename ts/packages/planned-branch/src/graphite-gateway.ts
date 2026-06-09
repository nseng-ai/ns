import { formatCommand, type ExecResult } from "./command-runtime.ts";
import { formatCommandFailure, type ExecOptions, type PlanCommandExecApi } from "@asdl/plans";

const GT_TIMEOUT_MS = 30_000;

export interface GraphiteTrackBranchParams {
	cwd: string;
	branch: string;
	parentBranch: string;
	signal?: AbortSignal | undefined;
}

export interface GraphiteErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type GraphiteOperationResult = { ok: true } | { ok: false; error: GraphiteErrorInfo };

export interface PlannedBranchGraphiteGateway {
	trackBranch(params: GraphiteTrackBranchParams): Promise<GraphiteOperationResult>;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

export class RealPlannedBranchGraphiteGateway implements PlannedBranchGraphiteGateway {
	private readonly pi: PlanCommandExecApi;

	constructor(pi: PlanCommandExecApi) {
		this.pi = pi;
	}

	async trackBranch(params: GraphiteTrackBranchParams): Promise<GraphiteOperationResult> {
		const args = ["track", params.branch, "--parent", params.parentBranch, "--no-interactive"];
		const displayCommand = formatCommand("gt", args);
		let result: ExecResult;
		try {
			result = await this.pi.exec("gt", args, execOptions(params.cwd, GT_TIMEOUT_MS, params.signal));
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			return {
				ok: false,
				error: {
					code: "graphite_startup_failed",
					message: `gt command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`,
					displayCommand,
				},
			};
		}

		if (result.code !== 0 || result.killed) {
			return { ok: false, error: failure("graphite_track_failed", "gt track failed", { result, displayCommand }) };
		}
		return { ok: true };
	}
}

function failure(code: string, title: string, run: CommandRun): GraphiteErrorInfo {
	return { code, message: formatCommandFailure(title, run.displayCommand, run.result), displayCommand: run.displayCommand };
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}
