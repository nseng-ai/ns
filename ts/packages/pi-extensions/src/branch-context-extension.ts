import { IMPL_BRANCH_CONTEXT_COMMAND_NAME } from "@asdl/branch-context";
import { WRITE_GRILLED_PLAN_COMMAND_NAME, WRITE_PLAN_COMMAND_NAME, registerEnrichedPlanCommandsAndTools } from "./branch-context/enriched-plan-save.ts";
import { CREATE_BRANCH_CONTEXT_COMMAND_NAME, UP_AND_IMPL_COMMAND_NAME, registerBranchContextCommands } from "./branch-context/from-plan-commands.ts";
import type { BranchContextExtensionOptions, ExtensionAPI } from "./branch-context/host-types.ts";
import { definePiSurfaceParity } from "./parity.ts";

export const branchContextExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: WRITE_PLAN_COMMAND_NAME,
		workflow: "Write and save a reviewed implementation plan in the local plan store",
		parity: "FULL",
		cli: "enriched-plan exec save",
		skill: "enriched-plan-save",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "branch-context-extension",
		notes: "Pi command expands the saved-plan prompt policy and drives the same typed saved-plan file tool.",
	},
	{
		kind: "command",
		surface: WRITE_GRILLED_PLAN_COMMAND_NAME,
		workflow: "Write and save a grilled implementation plan using structured requirements UI",
		parity: "WAIVED",
		fallback: "Use grill-me or grill-with-docs to settle requirements, then use the enriched-plan-save workflow to write the reviewed plan.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "branch-context-extension",
		notes: "Structured grill UI is Pi-native; the saved-plan storage path is accounted by write_saved_plan_file.",
	},
	{
		kind: "command",
		surface: CREATE_BRANCH_CONTEXT_COMMAND_NAME,
		workflow: "Create an implementation branch from a saved plan and attach branch context",
		parity: "FULL",
		cli: "branch-context exec from-plan",
		skill: "from-plan",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "branch-context-extension",
		notes: "Pi command delegates to branch-context helpers for source-branch plan selection, branch creation, and attachment.",
	},
	{
		kind: "command",
		surface: UP_AND_IMPL_COMMAND_NAME,
		workflow: "Create an upstack branch context and launch a fresh implementation session",
		parity: "WAIVED",
		fallback: "Use the from-plan skill to create the branch context, then use branch-context-impl to implement the attached plan.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "branch-context-extension",
		notes: "Branch-context creation has CLI/skill parity, but the fresh Pi implementation-session launch is Pi-specific orchestration.",
	},
	{
		kind: "command",
		surface: IMPL_BRANCH_CONTEXT_COMMAND_NAME,
		workflow: "Implement from the attached branch-context plan",
		parity: "FULL",
		cli: "branch-context exec load",
		skill: "branch-context-impl",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "branch-context-extension",
		notes: "Pi command loads the attached plan and expands the portable branch-context implementation skill prompt.",
	},
] as const);

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
