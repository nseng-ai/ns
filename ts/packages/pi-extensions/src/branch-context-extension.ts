import { registerEnrichedPlanCommandsAndTools } from "./branch-context/enriched-plan-save.ts";
import { registerBranchContextCommands } from "./branch-context/from-plan-commands.ts";
import type { BranchContextExtensionOptions, ExtensionAPI } from "./branch-context/host-types.ts";

export {
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
	buildWriteGrilledPlanPrompt,
	buildWritePlanPrompt,
	buildWriteSavedPlanFileTool,
	handleWriteGrilledPlanCommand,
	handleWritePlanCommand,
} from "./branch-context/enriched-plan-save.ts";
export {
	CREATE_BRANCH_CONTEXT_COMMAND_NAME,
	CREATE_BRANCH_CONTEXT_USAGE,
	UP_AND_IMPL_COMMAND_NAME,
	UP_AND_IMPL_USAGE,
	deriveCreateBranchContextPreview,
	formatCreateBranchContextPreview,
	handleCreateBranchContextCommand,
	handleImplBranchContextCommand,
	handleUpAndImplCommand,
	parseCreateBranchContextArgs,
	resolveCreateBranchContextPlanFile,
	resolveCreateBranchContextPreview,
	type CreateBranchContextArgs,
	type CreateBranchContextPreview,
} from "./branch-context/from-plan-commands.ts";
export type {
	BranchContextExtensionOptions,
	BranchContextOperations,
	CommandContext,
	CustomMessage,
	ExtensionAPI,
	NotifyLevel,
	ToolContext,
	ToolDefinition,
	ToolRenderResultOptions,
	ToolResult,
	ToolUpdateHandler,
} from "./branch-context/host-types.ts";

export default function registerBranchContextExtension(
	pi: ExtensionAPI,
	options: BranchContextExtensionOptions = {},
): void {
	registerEnrichedPlanCommandsAndTools(pi, options);
	registerBranchContextCommands(pi, options);
}
