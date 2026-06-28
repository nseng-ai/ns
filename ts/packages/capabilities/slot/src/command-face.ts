// Slot intentionally exports a mountable command face rather than a standalone
// `defineCli` entrypoint. The supported user-facing surface is `sdl slot ...`,
// so root CLI metadata such as `--version` and `--runtime` stays owned by
// `@sdl/kernel` instead of this capability package.
import { ClinkrGroup, type ClinkrDynamicCompletionRequest } from "@sdl/clinkr";
import type { SlotCliContext } from "./context.ts";
import {
	checkoutRequestSchema,
	checkoutResultSchema,
	renderCheckout,
	runCheckout,
} from "./operations/checkout.ts";
import {
	claimRequestSchema,
	claimResultSchema,
	renderClaim,
	runClaim,
} from "./operations/claim.ts";
import {
	foreachRequestSchema,
	foreachResultSchema,
	renderForeach,
	runForeach,
} from "./operations/foreach.ts";
import { freeRequestSchema, freeResultSchema, renderFree, runFree } from "./operations/free.ts";
import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "./operations/gc.ts";
import {
	gtDownRequestSchema,
	gtDownResultSchema,
	renderGtDownNavigation,
	runGtDown,
} from "./operations/gt/down.ts";
import {
	gtStackBranchesRequestSchema,
	gtStackBranchesResultSchema,
	renderStackBranches,
	runGtStackBranches,
} from "./operations/gt/exec/stack-branches.ts";
import {
	gtStackMapBranchesRequestSchema,
	gtStackMapBranchesResultSchema,
	renderStackMapBranches,
	runGtStackMapBranches,
} from "./operations/gt/exec/stack-map-branches.ts";
import {
	gtFreeStackRequestSchema,
	gtFreeStackResultSchema,
	renderGtFreeStack,
	runGtFreeStack,
} from "./operations/gt/free-stack.ts";
import {
	gtNavigationResultSchema,
	gtUpRequestSchema,
	renderGtUpNavigation,
	runGtUp,
} from "./operations/gt/up.ts";
import { gotoRequestSchema, gotoResultSchema, renderGoto, runGoto } from "./operations/goto.ts";
import { initRequestSchema, initResultSchema, renderInit, runInit } from "./operations/init.ts";
import { listRequestSchema, listResultSchema, renderList, runList } from "./operations/list.ts";
import {
	renderResize,
	resizeRequestSchema,
	resizeResultSchema,
	runResize,
} from "./operations/resize.ts";

export function buildSlotCommandGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const group = new ClinkrGroup<TContext>({
		name: "slot",
		description: "Manage the pool of Git-worktree-backed slots.",
	});
	configureSlotCommands(group);
	return group;
}

function configureSlotCommands<TContext extends SlotCliContext>(root: ClinkrGroup<TContext>): void {
	root.command({
		name: "list",
		description: "List worktree pool slots derived from Git worktree state.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
	root.command({
		name: "ls",
		description: "Alias for list.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
	root.command({
		name: "checkout",
		description: "Check out a branch into an available pool slot worktree.",
		schema: checkoutRequestSchema,
		positionals: { branchName: { position: 0 }, base: { position: 1 } },
		options: { new: { short: "-b" } },
		completionProvider: completeCheckoutBranches,
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	});
	root.command({
		name: "co",
		description: "Alias for checkout.",
		schema: checkoutRequestSchema,
		positionals: { branchName: { position: 0 }, base: { position: 1 } },
		options: { new: { short: "-b" } },
		completionProvider: completeCheckoutBranches,
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	});
	root.command({
		name: "goto",
		description: "Print/copy a cd command for an assigned slot.",
		schema: gotoRequestSchema,
		options: { num: { short: "-n" }, wt: { short: "-w" } },
		resultSchema: gotoResultSchema,
		handler: runGoto,
		renderHuman: renderGoto,
	});
	root.command({
		name: "claim",
		description: "Move a local branch into the current managed slot or lowest available slot.",
		schema: claimRequestSchema,
		positionals: { branchName: { position: 0 } },
		resultSchema: claimResultSchema,
		handler: runClaim,
		renderHuman: renderClaim,
	});
	root.command({
		name: "free",
		description: "Free assigned slots back to the pool.",
		schema: freeRequestSchema,
		options: {
			num: { short: "-n" },
			wt: { short: "-w" },
			branch: { short: "-b" },
			current: { short: "-c" },
			yes: { short: "-y" },
		},
		resultSchema: freeResultSchema,
		handler: runFree,
		renderHuman: renderFree,
	});
	root.command({
		name: "foreach",
		description: "Run a command in every managed slot worktree.",
		schema: foreachRequestSchema,
		positionals: { command: { position: 0 } },
		options: { yes: { short: "-y" } },
		resultSchema: foreachResultSchema,
		handler: runForeach,
		renderHuman: renderForeach,
	});
	root.command({
		name: "gc",
		description: "Free slots whose pull requests have closed or merged.",
		schema: gcRequestSchema,
		options: { force: { short: "-f" } },
		resultSchema: gcResultSchema,
		handler: runGc,
		renderHuman: renderGc,
	});
	root.command({
		name: "init",
		description: "Initialize the worktree pool with N detached slots at trunk.",
		schema: initRequestSchema,
		options: { size: {} },
		resultSchema: initResultSchema,
		handler: runInit,
		renderHuman: renderInit,
	});
	root.command({
		name: "resize",
		description: "Grow or shrink the worktree pool to --size slots.",
		schema: resizeRequestSchema,
		options: { size: {} },
		resultSchema: resizeResultSchema,
		handler: runResize,
		renderHuman: renderResize,
	});
	root.group(buildGtGroup());
}

async function completeCheckoutBranches<TContext extends SlotCliContext>(
	ctx: TContext,
	request: ClinkrDynamicCompletionRequest,
): Promise<{ candidates: { value: string; type: "positional-value" }[] }> {
	if (request.current.startsWith("-")) return { candidates: [] };
	if (request.positionalIndex !== 0 && request.positionalIndex !== 1) return { candidates: [] };
	const branches = await ctx.git.listLocalBranches();
	return {
		candidates: branches
			.filter((branch) => branch.startsWith(request.current))
			.map((branch) => ({ value: branch, type: "positional-value" })),
	};
}

function buildGtGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const gt = new ClinkrGroup<TContext>({
		name: "gt",
		description:
			"Navigate and free Graphite-aware slot stacks; metadata-backed stack commands require the sqlite3 CLI.",
	});
	gt.command({
		name: "up",
		description: "Print/copy a cd command for the immediate upstack Graphite branch.",
		schema: gtUpRequestSchema,
		resultSchema: gtNavigationResultSchema,
		handler: runGtUp,
		renderHuman: renderGtUpNavigation,
	});
	gt.command({
		name: "down",
		description: "Print/copy a cd command for the immediate downstack Graphite branch.",
		schema: gtDownRequestSchema,
		resultSchema: gtDownResultSchema,
		handler: runGtDown,
		renderHuman: renderGtDownNavigation,
	});
	gt.command({
		name: "free-stack",
		description:
			"Release every assigned slot in the current Graphite stack except the current branch.",
		schema: gtFreeStackRequestSchema,
		resultSchema: gtFreeStackResultSchema,
		handler: runGtFreeStack,
		renderHuman: renderGtFreeStack,
	});
	const exec = new ClinkrGroup<TContext>({
		name: "exec",
		description: "Skill-invoked Graphite operations.",
		isHidden: true,
	});
	exec.command({
		name: "stack-branches",
		description: "Emit the current Graphite stack branch list for skill/agent invocation.",
		schema: gtStackBranchesRequestSchema,
		resultSchema: gtStackBranchesResultSchema,
		handler: runGtStackBranches,
		renderHuman: renderStackBranches,
	});
	exec.command({
		name: "stack-map-branches",
		description: "Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
		schema: gtStackMapBranchesRequestSchema,
		resultSchema: gtStackMapBranchesResultSchema,
		handler: runGtStackMapBranches,
		renderHuman: renderStackMapBranches,
	});
	gt.group(exec);
	return gt;
}
