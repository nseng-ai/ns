import type { RunnerSubagentPi } from "@internal/pi-tools/runner-subagents";
import { definePiSurfaceParity } from "@ns/pi/parity/extension";
import { THERMO_COUNCIL_COMMAND_NAME } from "./contract.ts";
import { runThermoCouncilCommand } from "./orchestrator.ts";
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

export const thermoCouncilParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: THERMO_COUNCIL_COMMAND_NAME,
		workflow:
			"Run a Pi-native multi-model thermonuclear review council and present a session-local synthesized report",
		parity: "WAIVED",
		fallback:
			"Non-Pi agents should run the portable thermonuclear review rubric directly from .ns/reviews/thermonuclear-review/review.md or use the Thermostack skill for a single-agent review/branch proposal workflow.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/thermo-council",
		sourceModule: "thermo-council",
		notes:
			"The command is Pi-specific because it orchestrates multiple Pi runner subagents, model refs, terminal capture tools, and session-local presentation.",
	},
] as const);

export default function thermoCouncilExtension(pi: ThermoCouncilExtensionAPI): void {
	pi.registerCommand(THERMO_COUNCIL_COMMAND_NAME, {
		description:
			"Run a multi-model thermonuclear review council over inferred checkout scope and present one session-local report",
		argumentHint: "[review guidance]",
		handler: async (args, ctx) => {
			await ctx.waitForIdle?.();
			await runThermoCouncilCommand(pi, ctx, args);
		},
	});
}
