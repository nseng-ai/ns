import { execApiToCommandRunner, type ExecResult } from "@nseng-ai/foundation/command";
import { createPiCommandExecApi, type RawPiExecApi } from "@nseng-ai/pi/shared/command-exec";
import { runGraphiteCommand } from "@nseng-ai/extension-kit/graphite/branch";

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
