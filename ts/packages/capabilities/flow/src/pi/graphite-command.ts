import {
	execApiToCommandRunner,
	type ExecOptions,
	type ExecResult,
	piExecApiToCommandExecApi,
} from "@nseng-ai/foundation/command";
import { runGraphiteCommand } from "@nseng-ai/capability-kit/graphite/branch";

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
