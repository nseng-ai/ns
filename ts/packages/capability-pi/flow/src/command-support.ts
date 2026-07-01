import {
	execApiToCommandRunner,
	type ExecOptions,
	type ExecResult,
	piExecApiToCommandExecApi,
} from "@sdl/core/command";
import { runGraphiteCommand } from "@sdl/graphite/branch";
import type { AutocompleteItem } from "@sdl/pi/runtime/extension-types";

export interface FlowCommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		select?(title: string, options: string[]): Promise<string | undefined> | string | undefined;
	};
	waitForIdle?(): Promise<void>;
}

export interface FlowRegisteredCommand<TContext extends FlowCommandContext = FlowCommandContext> {
	description?: string;
	argumentHint?: string;
	getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
	handler(args: string, ctx: TContext): Promise<void> | void;
}

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
