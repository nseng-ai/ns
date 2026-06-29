import { NodeCommandExecApi } from "@sdl/exec";
import type { CommandExecApi, ExecResult } from "@sdl/exec";

export interface SlotCommandRunOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}

/**
 * Narrow gateway for running an arbitrary user command inside a slot worktree.
 *
 * Intentionally separate from the git gateway: `foreach` runs raw user argv with
 * `shell: false` and must not reach into git-specific plumbing.
 */
export interface SlotCommandGateway {
	run(
		command: string,
		args: readonly string[],
		options: SlotCommandRunOptions,
	): Promise<ExecResult>;
}

export class RealSlotCommandGateway implements SlotCommandGateway {
	private readonly execApi: CommandExecApi;

	constructor(options: { execApi?: CommandExecApi | undefined } = {}) {
		this.execApi = options.execApi ?? new NodeCommandExecApi();
	}

	async run(
		command: string,
		args: readonly string[],
		options: SlotCommandRunOptions,
	): Promise<ExecResult> {
		// No timeout: arbitrary user commands (e.g. `git fetch`, test runs) may be
		// long-running and must not be silently killed.
		return await this.execApi.exec(command, [...args], {
			cwd: options.cwd,
			...(options.env === undefined ? {} : { env: options.env }),
		});
	}
}
