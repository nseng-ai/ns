import { formatCommand, type CommandRunner, type ExecOptions, type ExecResult } from "./exec.ts";

export const GITHUB_CLI_TIMEOUT_MS = 30_000;
export const GITHUB_CLI_STARTUP_ERROR_CODE = 127;

interface RunGitHubCliBaseOptions {
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly timeoutMs?: number | undefined;
}

export interface RunGitHubCliOptions extends RunGitHubCliBaseOptions {
	readonly runner: CommandRunner;
}

export type RunGitHubCliResult =
	| {
			readonly type: "completed";
			readonly command: readonly string[];
			readonly displayCommand: string;
			readonly result: ExecResult;
	  }
	| {
			readonly type: "startup_error";
			readonly command: readonly string[];
			readonly displayCommand: string;
			readonly message: string;
	  };

export async function runGitHubCli(options: RunGitHubCliOptions): Promise<RunGitHubCliResult> {
	const args = [...options.args];
	const command = ["gh", ...args];
	const displayCommand = formatCommand("gh", args);
	try {
		const result = await options.runner("gh", args, githubCliExecOptions(options));
		return { type: "completed", command, displayCommand, result };
	} catch (caught) {
		return {
			type: "startup_error",
			command,
			displayCommand,
			message: caught instanceof Error ? caught.message : String(caught),
		};
	}
}

export async function runGitHubCliAsExecResult(options: RunGitHubCliOptions): Promise<ExecResult> {
	const result = await runGitHubCli(options);
	if (result.type === "completed") return result.result;
	return { stdout: "", stderr: result.message, code: GITHUB_CLI_STARTUP_ERROR_CODE, killed: false };
}

function githubCliExecOptions(options: RunGitHubCliOptions): ExecOptions {
	return {
		cwd: options.cwd,
		timeout: options.timeoutMs ?? GITHUB_CLI_TIMEOUT_MS,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}
