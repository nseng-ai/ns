import { execApiToCommandRunner, type ExecResult } from "@nseng-ai/foundation/command";
import { createPiCommandExecApi, type RawPiExecApi } from "@nseng-ai/pi/shared/exec-gateway";
import { runGraphiteCommand } from "@nseng-ai/capability-kit/graphite/branch";

export type FlowGraphiteCommandHost = RawPiExecApi;

export interface RunFlowGraphiteCommandOptions {
	cwd: string;
	args: readonly string[];
	timeoutMs: number;
}

export async function runFlowGraphiteCommand(
	host: FlowGraphiteCommandHost,
	options: RunFlowGraphiteCommandOptions,
): Promise<ExecResult> {
	return await runGraphiteCommand(execApiToCommandRunner(createPiCommandExecApi(host)), options);
}
