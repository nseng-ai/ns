import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@sdl/capability-kit/sdl-command";
import {
	defineExtension,
	type SdlCommand,
	type SdlCommandSchema,
	type SdlExtensionApi,
} from "sdl-sdk";

import {
	attachRequestSchema,
	attachResultSchema,
	branchContextResultSchema,
	checkResultSchema,
	createRealBranchContextCliContext,
	createRequestSchema,
	deleteResultSchema,
	handleAttach,
	handleCheck,
	handleCreate,
	handleDelete,
	handleList,
	handleLoad,
	keyRequestSchema,
	listRequestSchema,
	listResultSchema,
	loadPlanResultSchema,
	loadRequestSchema,
	type BranchContextCliContext,
} from "./operations.ts";

type BranchContextSdlCommandOptions<S extends SdlCommandSchema, T> = Omit<
	SdlDomainCommandOptions<S, T, BranchContextCliContext>,
	"createContext"
>;

function branchContextCommand<S extends SdlCommandSchema, T>(
	options: BranchContextSdlCommandOptions<S, T>,
): SdlCommand<S, T> {
	return createSdlDomainCommand({
		...options,
		createContext: createBranchContextExtensionContext,
	});
}

function createBranchContextExtensionContext(ctx: SdlExtensionApi): BranchContextCliContext {
	return createRealBranchContextCliContext({
		cwd: ctx.cwd,
		env: ctx.env,
		stderr: ctx.stderr,
	});
}

export default defineExtension({
	commands: [
		branchContextCommand({
			name: "from-plan",
			summary: "Create branch context from a saved plan.",
			description: "Create a branch context entry from a saved plan file for agent implementation.",
			schema: createRequestSchema,
			resultSchema: branchContextResultSchema,
			handler: handleCreate,
		}),
		branchContextCommand({
			name: "load",
			summary: "Load an attached branch-context plan.",
			description:
				"Load a branch-context entry and render the implementation prompt for agent invocation.",
			schema: loadRequestSchema,
			resultSchema: loadPlanResultSchema,
			positionals: { key: { position: 0 } },
			handler: handleLoad,
		}),
		branchContextCommand({
			name: "attach",
			summary: "Attach a saved plan or file as branch context.",
			description:
				"Attach a saved plan or arbitrary file to the current or selected branch context namespace.",
			schema: attachRequestSchema,
			resultSchema: attachResultSchema,
			positionals: { key: { position: 0 } },
			handler: handleAttach,
		}),
		branchContextCommand({
			name: "list",
			summary: "List branch-context entries.",
			description: "List branch-context entries attached to the current or selected branch.",
			schema: listRequestSchema,
			resultSchema: listResultSchema,
			handler: handleList,
		}),
		branchContextCommand({
			name: "check",
			summary: "Check a branch-context entry.",
			description: "Check whether a branch-context entry exists on the current or selected branch.",
			schema: keyRequestSchema,
			resultSchema: checkResultSchema,
			positionals: { key: { position: 0 } },
			handler: handleCheck,
		}),
		branchContextCommand({
			name: "delete",
			summary: "Delete a branch-context entry.",
			description: "Delete a branch-context entry from the current or selected branch.",
			schema: keyRequestSchema,
			resultSchema: deleteResultSchema,
			positionals: { key: { position: 0 } },
			handler: handleDelete,
		}),
	],
});
