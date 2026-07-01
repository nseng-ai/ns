import {
	execApiToCommandRunner,
	type ExecOptions,
	type ExecResult,
	piExecApiToCommandExecApi,
} from "@sdl/core/command";
import { runGraphiteCommand } from "@sdl/graphite/branch";

export interface FlowGraphiteCommandHost {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

export interface RunFlowGraphiteCommandOptions {
	cwd: string;
	args: readonly string[];
	timeoutMs: number;
}

export async function runFlowGraphiteCommand(
	host: FlowGraphiteCommandHost,
	options: RunFlowGraphiteCommandOptions,
): Promise<ExecResult> {
	return await runGraphiteCommand(execApiToCommandRunner(piExecApiToCommandExecApi(host)), options);
}
