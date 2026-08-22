import {
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	IMPL_SAVED_PLAN_COMMAND_NAME,
} from "@nseng-ai/branch-context/api";
import {
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
	registerSavedPlanCommands,
} from "./saved-plan-commands.ts";
import {
	CREATE_BRANCH_CONTEXT_COMMAND_NAME,
	GT_UPSTACK_IMPL_COMMAND_NAME,
	registerBranchContextCommands,
} from "./from-plan-commands.ts";
import type { BranchContextExtensionOptions, ExtensionAPI } from "./host-types.ts";
import { createBranchContextPiCommandApi } from "./pi-command-api.ts";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";

export const branchContextExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: WRITE_PLAN_COMMAND_NAME,
		workflow: "Write and save a reviewed implementation plan in the local plan store",
		parity: "WAIVED",
		fallback: "Saved Plan authoring is available through Pi /ns:plan:save.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-branch-context",
		sourceModule: "branch-context-extension",
		notes:
			"Pi keeps the conversational planning turn while the injected prompt drives the portable enriched-plan exec save command.",
	},
	{
		kind: "command",
		surface: WRITE_GRILLED_PLAN_COMMAND_NAME,
		workflow: "Write and save a grilled implementation plan using structured requirements UI",
		parity: "WAIVED",
		fallback:
			"Use grill-me or grill-with-docs to settle requirements, then use /ns:plan:save to write the reviewed plan.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-branch-context",
		sourceModule: "branch-context-extension",
		notes:
			"Structured grill UI is Pi-native; after requirements settle, the injected prompt drives enriched-plan exec save.",
	},
	{
		kind: "command",
		surface: CREATE_BRANCH_CONTEXT_COMMAND_NAME,
		workflow: "Create an implementation branch from a saved plan and attach branch context",
		parity: "FULL",
		cli: "ns branch-context exec from-plan",
		skill: "from-plan",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-branch-context",
		sourceModule: "branch-context-extension",
		notes:
			"Pi command delegates to branch-context helpers for source-branch plan selection, branch creation, and attachment.",
	},
	{
		kind: "command",
		surface: GT_UPSTACK_IMPL_COMMAND_NAME,
		workflow: "Create an upstack branch context and launch a fresh implementation session",
		parity: "WAIVED",
		fallback:
			"Use the from-plan skill to create the branch context, then use branch-context-impl to implement the attached plan.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-branch-context",
		sourceModule: "branch-context-extension",
		notes:
			"Branch-context creation has CLI/skill parity, but the fresh Pi implementation-session launch is Pi-specific orchestration.",
	},
	{
		kind: "command",
		surface: IMPL_SAVED_PLAN_COMMAND_NAME,
		workflow:
			"Launch a fresh current-branch implementation session from a session-selected, latest fallback, or explicit Saved Plan",
		parity: "WAIVED",
		fallback:
			"Manually open /new on the current branch and paste/use the saved plan content, or pass an explicit saved plan path to the Pi command when available.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-branch-context",
		sourceModule: "branch-context-extension",
		notes:
			"Saved-plan selection has capability coverage, but the fresh Pi implementation-session launch is Pi-specific orchestration and does not attach Branch Context.",
	},
	{
		kind: "command",
		surface: IMPL_BRANCH_CONTEXT_COMMAND_NAME,
		workflow: "Implement from the attached branch-context plan",
		parity: "FULL",
		cli: "ns branch-context exec load",
		skill: "branch-context-impl",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-branch-context",
		sourceModule: "branch-context-extension",
		notes:
			"Pi command loads the attached plan and expands the portable branch-context implementation skill prompt.",
	},
] as const);

export {
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
	buildWriteGrilledPlanPrompt,
	buildWritePlanPrompt,
	handleWriteGrilledPlanCommand,
	handleWritePlanCommand,
} from "./saved-plan-commands.ts";
export {
	CREATE_BRANCH_CONTEXT_COMMAND_NAME,
	CREATE_BRANCH_CONTEXT_USAGE,
	GT_UPSTACK_IMPL_COMMAND_NAME,
	GT_UPSTACK_IMPL_USAGE,
	IMPL_SAVED_PLAN_COMMAND_NAME,
	IMPL_SAVED_PLAN_USAGE,
	buildImplSavedPlanPrompt,
	deriveCreateBranchContextPreview,
	deriveImplSavedPlanPreview,
	formatCreateBranchContextPreview,
	formatImplSavedPlanEvidence,
	handleCreateBranchContextCommand,
	handleImplBranchContextCommand,
	handleGtUpstackImplCommand,
	handleImplSavedPlanCommand,
	parseCreateBranchContextArgs,
	parseImplSavedPlanArgs,
	resolveCreateBranchContextPlanFile,
	resolveCreateBranchContextPreview,
	type CreateBranchContextArgs,
	type CreateBranchContextPreview,
	type ImplSavedPlanArgs,
	type ImplSavedPlanPreview,
} from "./from-plan-commands.ts";
export type {
	BranchContextExtensionOptions,
	BranchContextOperations,
	CommandContext,
	CustomMessage,
	ExtensionAPI,
	NotifyLevel,
} from "./host-types.ts";

export default function registerBranchContextExtension(
	pi: ExtensionAPI,
	options: BranchContextExtensionOptions = {},
): void {
	const commandPi = createBranchContextPiCommandApi(pi);
	registerSavedPlanCommands(commandPi);
	registerBranchContextCommands(commandPi, options);
}
