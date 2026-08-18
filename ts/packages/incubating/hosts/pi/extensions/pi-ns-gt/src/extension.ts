import {
	GT_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME,
	GT_NEW_BRANCH_FROM_PLAN_COMMAND_NAME,
} from "@nseng-ai/branch-context/api";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";

import { registerGtCommands, type GtExtensionOptions } from "./from-plan-commands.ts";
import type { ExtensionAPI } from "./host-types.ts";
import { createBranchContextPiCommandApi } from "./pi-command-api.ts";

export const gtExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: GT_NEW_BRANCH_FROM_PLAN_COMMAND_NAME,
		workflow:
			"Create a Graphite-tracked implementation branch from a saved plan and attach Branch Context",
		parity: "FULL",
		cli: "ns branch-context exec from-plan --branch-creation graphite",
		skill: "branch-context-from-plan",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-gt",
		sourceModule: "gt-extension",
		notes:
			"The Pi command selects GT by namespace and delegates attachment to the curated Branch Context API.",
	},
	{
		kind: "command",
		surface: GT_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME,
		workflow:
			"Create a Graphite branch context from a Saved Plan and launch a fresh implementation session",
		parity: "WAIVED",
		fallback:
			"Create with the portable Branch Context CLI, check out the branch, then implement the attached plan.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-gt",
		sourceModule: "gt-extension",
		notes: "Fresh Pi session replacement is host-specific orchestration.",
	},
] as const);

export default function registerGtExtension(
	pi: ExtensionAPI,
	options: GtExtensionOptions = {},
): void {
	registerGtCommands(createBranchContextPiCommandApi(pi), options);
}

export {
	GT_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME,
	GT_IMPL_BRANCH_FROM_PLAN_USAGE,
	GT_NEW_BRANCH_FROM_PLAN_COMMAND_NAME,
	GT_NEW_BRANCH_FROM_PLAN_USAGE,
} from "./from-plan-commands.ts";
export type {
	BranchContextExtensionOptions,
	BranchContextOperations,
	CommandContext,
	ExtensionAPI,
	ToolContext,
	ToolDefinition,
} from "./host-types.ts";
