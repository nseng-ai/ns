import { formatCommand, formatCommandFailure, type CommandExecApi, type ExecOptions } from "@asdl/core/exec";

const GIT_STATUS_TIMEOUT_MS = 10_000;

export interface ObjectiveGitErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type ObjectiveGitResult<T> = { ok: true; value: T } | { ok: false; error: ObjectiveGitErrorInfo };

export interface ObjectiveDirtyPathParams {
	repoRoot: string;
	relativePath: string;
	signal?: AbortSignal | undefined;
}

export interface ObjectiveGitFactsGateway {
	hasUncommittedChangesUnder(params: ObjectiveDirtyPathParams): Promise<ObjectiveGitResult<boolean>>;
}

export class RealObjectiveGitFactsGateway implements ObjectiveGitFactsGateway {
	private readonly execApi: CommandExecApi;

	constructor(execApi: CommandExecApi) {
		this.execApi = execApi;
	}

	async hasUncommittedChangesUnder(params: ObjectiveDirtyPathParams): Promise<ObjectiveGitResult<boolean>> {
		const args = ["status", "--porcelain", "--", params.relativePath];
		const displayCommand = formatCommand("git", args);
		try {
			const result = await this.execApi.exec("git", args, execOptions(params.repoRoot, params.signal));
			if (result.code !== 0 || result.killed) {
				return {
					ok: false,
					error: {
						code: "objective_dirty_status_failed",
						message: formatCommandFailure("git status for Objective record failed", displayCommand, result),
						displayCommand,
					},
				};
			}
			return { ok: true, value: result.stdout.trim().length > 0 };
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			return {
				ok: false,
				error: {
					code: "objective_dirty_status_startup_failed",
					message: `git status for Objective record failed before completion.\nCommand: ${displayCommand}\nError: ${message}`,
					displayCommand,
				},
			};
		}
	}
}

export class CleanObjectiveGitFactsGateway implements ObjectiveGitFactsGateway {
	async hasUncommittedChangesUnder(_params: ObjectiveDirtyPathParams): Promise<ObjectiveGitResult<boolean>> {
		return { ok: true, value: false };
	}
}

function execOptions(cwd: string, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) return { cwd, timeout: GIT_STATUS_TIMEOUT_MS };
	return { cwd, timeout: GIT_STATUS_TIMEOUT_MS, signal };
}
