import { ClinkrGroup } from "@nseng-ai/clinkr";
import { defineCli } from "@nseng-ai/foundation/cli-runtime";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	attachRequestSchema,
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
	loadRequestSchema,
	renderAttachData,
	renderCheckData,
	renderDeleteData,
	renderListData,
	renderLoadPlanData,
	type BranchContextCliContext,
	type CliDeps,
} from "./operations.ts";

const entry = defineCli<BranchContextCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Branch context operations.",
	prepareRun: ({ deps, cwd }) => {
		const context =
			deps.context === undefined
				? createRealBranchContextCliContext({
						cwd,
						...optionalEntry("planStoreRoot", deps.planStoreRoot),
					})
				: {
						context: deps.context,
						cwd,
						...optionalEntry("planStoreRoot", deps.planStoreRoot),
					};
		return { type: "run", context, buildState: undefined };
	},
	buildCli: ({ appBuilder }) => {
		const root = new ClinkrGroup<BranchContextCliContext>({ name: "branch-context" });
		const execGroup = new ClinkrGroup<BranchContextCliContext>({
			name: "exec",
			description: "Run hidden deterministic branch-context operations for agents.",
			isHidden: true,
		});
		execGroup.command({
			name: "from-plan",
			description: "Create a branch context from a saved plan.",
			schema: createRequestSchema,
			handler: handleCreate,
		});
		execGroup.command({
			name: "load",
			description: "Load a branch-context entry and render the implementation prompt.",
			schema: loadRequestSchema,
			positionals: { key: { position: 0 } },
			handler: handleLoad,
			renderHuman: renderLoadPlanData,
		});
		execGroup.command({
			name: "attach",
			description: "Attach a saved plan or file as branch context.",
			schema: attachRequestSchema,
			positionals: { key: { position: 0 } },
			handler: handleAttach,
			renderHuman: renderAttachData,
		});
		execGroup.command({
			name: "list",
			description: "List branch-context entries.",
			schema: listRequestSchema,
			resultSchema: listResultSchema,
			handler: handleList,
			renderHuman: renderListData,
		});
		execGroup.command({
			name: "check",
			description: "Check whether a branch-context entry exists.",
			schema: keyRequestSchema,
			positionals: { key: { position: 0 } },
			resultSchema: checkResultSchema,
			handler: handleCheck,
			renderHuman: renderCheckData,
		});
		execGroup.command({
			name: "delete",
			description: "Delete a branch-context entry.",
			schema: keyRequestSchema,
			positionals: { key: { position: 0 } },
			resultSchema: deleteResultSchema,
			handler: handleDelete,
			renderHuman: renderDeleteData,
		});
		root.group(execGroup);
		appBuilder.importLegacyClinkrGroupForMigration(root);
	},
});

export const VERSION = entry.version;

export async function buildCli() {
	return await entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}
