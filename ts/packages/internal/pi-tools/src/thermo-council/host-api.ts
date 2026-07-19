import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
	RunnerSubagentContext,
	RunnerSubagentPi,
	SubagentFleetDisplayContext,
} from "@internal/ns-pi-subagents/api";
import type { ModelThinking } from "@nseng-ai/foundation/model-slug";
import type { ModelInfo } from "@nseng-ai/pi/runtime/types";
import type {
	RawPiExecApi,
	RawPiExecOptions,
	RawPiExecResult,
} from "@nseng-ai/pi/shared/command-exec";

export type { RawPiExecOptions, RawPiExecResult };

export interface ThermoCouncilExtensionAPI
	extends RunnerSubagentPi, RawPiExecApi, Pick<ExtensionAPI, "events" | "on"> {
	registerCommand(name: string, command: RegisteredCommand): void;
	getThinkingLevel(): ModelThinking;
	sendMessage?(message: CustomMessage): void | Promise<void>;
}

export interface RegisteredCommand {
	readonly description?: string;
	readonly argumentHint?: string;
	handler(args: string, ctx: ThermoCouncilCommandContext): Promise<void> | void;
}

type ThermoCouncilCommandUi = NonNullable<SubagentFleetDisplayContext["ui"]> & {
	notify?(message: string, level?: "info" | "warning" | "error"): void;
};

export interface ThermoCouncilCommandContext {
	readonly cwd: string;
	readonly signal?: AbortSignal;
	readonly model?: ModelInfo;
	readonly thinking?: ModelThinking;
	readonly hasUI?: boolean;
	readonly ui?: ThermoCouncilCommandUi;
	waitForIdle?(): Promise<void>;
}

export function toRunnerSubagentContext(ctx: ThermoCouncilCommandContext): RunnerSubagentContext {
	return {
		cwd: ctx.cwd,
		...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
		...(ctx.model === undefined
			? {}
			: {
					modelSelection: {
						provider: ctx.model.provider,
						modelId: ctx.model.id,
						thinking: ctx.thinking ?? "minimal",
					},
				}),
	};
}

export interface CustomMessage {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
	readonly details?: unknown;
}
