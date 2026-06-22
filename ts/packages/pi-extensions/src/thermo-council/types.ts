import type { ModelInfo } from "../cmux/types.ts";
import type { RunnerSubagentPi } from "../runner-subagent.ts";
import type {
	FindingConfidence,
	FindingSeverity,
	ThermoCouncilFinding,
	ThermoCouncilScope,
	ThermoCouncilSeatConfig,
	ThermoCouncilSeatId,
} from "../thermo-council-contract.ts";

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

export interface EnvReader {
	readonly get: (name: string) => string | undefined;
}

export interface ScopeResultLoaded {
	readonly type: "loaded";
	readonly scope: ThermoCouncilScope;
}

export interface ScopeResultFailed {
	readonly type: "failed";
	readonly message: string;
}

export type ScopeResult = ScopeResultLoaded | ScopeResultFailed;

export interface FlatFinding {
	readonly seat: ThermoCouncilSeatConfig;
	readonly finding: ThermoCouncilFinding;
}

export interface FindingCluster {
	readonly title: string;
	readonly files: readonly string[];
	readonly support: readonly ThermoCouncilSeatConfig[];
	readonly findings: readonly FlatFinding[];
	readonly severity: FindingSeverity;
	readonly confidence: FindingConfidence;
	readonly rankScore: number;
}

export interface DefaultSeat {
	readonly id: ThermoCouncilSeatId;
	readonly label: string;
	readonly model: string;
	readonly envVar: string;
}
