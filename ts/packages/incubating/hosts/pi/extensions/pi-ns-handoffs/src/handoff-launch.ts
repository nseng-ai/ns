import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import { createPiHandoffContext } from "./api-context.ts";
import {
	buildHandoffLaunchTool,
	runHandoffCreateCommand,
	type HandoffLaunchCommandSpec,
	type HandoffLaunchParams,
	type HandoffLaunchToolSpec,
} from "./launch-flow.ts";
import type { HandoffCreateSkillLoader } from "./create-skill.ts";
import type { ExtensionAPI, ToolDefinition } from "./runtime-types.ts";

export interface HandoffPromptCreateIntegration {
	runCreateCommand(
		args: string,
		ctx: Parameters<typeof runHandoffCreateCommand>[2],
		spec: Omit<HandoffLaunchCommandSpec, "git">,
	): Promise<void>;
}

export interface HandoffLaunchIntegration extends HandoffPromptCreateIntegration {
	buildVerifiedLaunchTool<P extends HandoffLaunchParams = HandoffLaunchParams>(
		spec: HandoffLaunchToolSpec<P>,
	): ToolDefinition;
}

export interface HandoffLaunchIntegrationOptions {
	skillLoader?: HandoffCreateSkillLoader;
}

export function createHandoffLaunchIntegration(
	pi: ExtensionAPI,
	options: HandoffLaunchIntegrationOptions = {},
): HandoffLaunchIntegration {
	const commands = createPiCommandExecApi(pi);
	const handoffContext = createPiHandoffContext(commands);
	return {
		async runCreateCommand(args, ctx, spec): Promise<void> {
			await runHandoffCreateCommand(pi, args, ctx, {
				...spec,
				git: handoffContext.git,
				...optionalEntry("skillLoader", options.skillLoader),
			});
		},
		buildVerifiedLaunchTool<P extends HandoffLaunchParams>(
			spec: HandoffLaunchToolSpec<P>,
		): ToolDefinition {
			return buildHandoffLaunchTool(commands, spec);
		},
	};
}

export type { CommandContext, ToolDefinition, ToolResult } from "./runtime-types.ts";
export type { ExtensionAPI as HandoffExtensionAPI } from "./runtime-types.ts";
export type {
	HandoffLaunchCommandSpec,
	HandoffLaunchParams,
	HandoffLaunchParamsParseResult,
	HandoffLaunchPromptCopy,
	HandoffLaunchToolSpec,
} from "./launch-flow.ts";
export {
	buildHandoffLaunchPrompt,
	buildHandoffLaunchRequest,
	parseHandoffLaunchParams,
} from "./launch-flow.ts";
export type { HandoffCreateSkillLoader } from "./create-skill.ts";
export type { HandoffStartMessages } from "./ui-status.ts";
