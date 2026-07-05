import type { RunnerSubagentPi } from "@internal/pi-tools/runner-subagents";
import type { ModelInfo } from "@ns/pi/runtime/types";

export interface ExecResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly code: number;
	readonly killed?: boolean;
}

export interface ExecOptions {
	readonly cwd?: string;
	readonly timeout?: number;
	readonly signal?: AbortSignal;
}

export interface ThermoCouncilExtensionAPI extends RunnerSubagentPi {
	registerCommand(name: string, command: RegisteredCommand): void;
	sendMessage?(message: CustomMessage): void | Promise<void>;
	exec(command: string, args: readonly string[], options?: ExecOptions): Promise<ExecResult>;
}

export interface RegisteredCommand {
	readonly description?: string;
	readonly argumentHint?: string;
	handler(args: string, ctx: ThermoCouncilCommandContext): Promise<void> | void;
}

export interface ThermoCouncilCommandContext {
	readonly cwd: string;
	readonly signal?: AbortSignal;
	readonly model?: ModelInfo;
	readonly hasUI?: boolean;
	readonly ui?: {
		notify?(message: string, level?: "info" | "warning" | "error"): void;
		setStatus?(key: string, value: string | undefined): void;
	};
	waitForIdle?(): Promise<void>;
}

export interface CustomMessage {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
	readonly details?: unknown;
}
