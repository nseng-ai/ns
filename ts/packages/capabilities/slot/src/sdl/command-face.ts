// Slot intentionally exports a mountable command face rather than a standalone
// `defineCli` entrypoint. The supported user-facing surface is `sdl slot ...`,
// so root CLI metadata such as `--version` and `--runtime` stays owned by
// `@sdl/kernel` instead of this capability package.
import { ClinkrGroup, type ClinkrDynamicCompletionRequest } from "@sdl/clinkr";
import {
	checkoutOptionSpecs,
	foreachOptionSpecs,
	freeOptionSpecs,
	gcOptionSpecs,
	gotoOptionSpecs,
	gtFreeStackOptionSpecs,
	gtNavigationOptionSpecs,
	sizeOptionSpecs,
} from "../core/command-options.ts";
import type { SlotCliContext } from "../core/context.ts";
import {
	checkoutRequestSchema,
	checkoutResultSchema,
	renderCheckout,
	runCheckout,
} from "../lifecycle/operations/checkout.ts";
import {
	claimRequestSchema,
	claimResultSchema,
	renderClaim,
	runClaim,
} from "../lifecycle/operations/claim.ts";
import {
	foreachRequestSchema,
	foreachResultSchema,
	renderForeach,
	runForeach,
} from "../lifecycle/operations/foreach.ts";
import {
	freeRequestSchema,
	freeResultSchema,
	renderFree,
	runFree,
} from "../lifecycle/operations/free.ts";
import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "../lifecycle/operations/gc.ts";
import {
	gtDownRequestSchema,
	gtDownResultSchema,
	renderGtDownNavigation,
	runGtDown,
} from "../lifecycle/operations/gt/down.ts";
import {
	gtStackBranchesRequestSchema,
	gtStackBranchesResultSchema,
	renderStackBranches,
	runGtStackBranches,
} from "../lifecycle/operations/gt/exec/stack-branches.ts";
import {
	gtQuiescenceRequestSchema,
	gtQuiescenceResultSchema,
	renderGtQuiescence,
	runGtQuiescence,
} from "../lifecycle/operations/gt/exec/quiescence.ts";
import {
	gtStackMapBranchesRequestSchema,
	gtStackMapBranchesResultSchema,
	renderStackMapBranches,
	runGtStackMapBranches,
} from "../lifecycle/operations/gt/exec/stack-map-branches.ts";
import {
	gtFreeStackRequestSchema,
	gtFreeStackResultSchema,
	renderGtFreeStack,
	runGtFreeStack,
} from "../lifecycle/operations/gt/free-stack.ts";
import {
	gtNavigationResultSchema,
	gtUpRequestSchema,
	renderGtUpNavigation,
	runGtUp,
} from "../lifecycle/operations/gt/up.ts";
import {
	gotoRequestSchema,
	gotoResultSchema,
	renderGoto,
	runGoto,
} from "../lifecycle/operations/goto.ts";
import {
	initRequestSchema,
	initResultSchema,
	renderInit,
	runInit,
} from "../lifecycle/operations/init.ts";
import {
	listRequestSchema,
	listResultSchema,
	renderList,
	runList,
} from "../lifecycle/operations/list.ts";
import {
	renderResize,
	resizeRequestSchema,
	resizeResultSchema,
	runResize,
} from "../lifecycle/operations/resize.ts";

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
		options: checkoutOptionSpecs,
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
		options: checkoutOptionSpecs,
		completionProvider: completeCheckoutBranches,
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	});
	root.command({
		name: "goto",
		description: "Print/copy a cd command for an assigned slot.",
		schema: gotoRequestSchema,
		options: gotoOptionSpecs,
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
		options: freeOptionSpecs,
		resultSchema: freeResultSchema,
		handler: runFree,
		renderHuman: renderFree,
	});
	root.command({
		name: "foreach",
		description: "Run a command in every managed slot worktree.",
		schema: foreachRequestSchema,
		positionals: { command: { position: 0 } },
		options: foreachOptionSpecs,
		resultSchema: foreachResultSchema,
		handler: runForeach,
		renderHuman: renderForeach,
	});
	root.command({
		name: "gc",
		description: "Free slots whose pull requests have closed or merged.",
		schema: gcRequestSchema,
		options: gcOptionSpecs,
		resultSchema: gcResultSchema,
		handler: runGc,
		renderHuman: renderGc,
	});
	root.command({
		name: "init",
		description: "Initialize the worktree pool with N detached slots at trunk.",
		schema: initRequestSchema,
		options: sizeOptionSpecs,
		resultSchema: initResultSchema,
		handler: runInit,
		renderHuman: renderInit,
	});
	root.command({
		name: "resize",
		description: "Grow or shrink the worktree pool to --size slots.",
		schema: resizeRequestSchema,
		options: sizeOptionSpecs,
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
		options: gtNavigationOptionSpecs,
		resultSchema: gtNavigationResultSchema,
		handler: runGtUp,
		renderHuman: renderGtUpNavigation,
	});
	gt.command({
		name: "down",
		description: "Print/copy a cd command for the immediate downstack Graphite branch.",
		schema: gtDownRequestSchema,
		options: gtNavigationOptionSpecs,
		resultSchema: gtDownResultSchema,
		handler: runGtDown,
		renderHuman: renderGtDownNavigation,
	});
	gt.command({
		name: "free-stack",
		description:
			"Release every assigned slot in the current Graphite stack except the current branch.",
		schema: gtFreeStackRequestSchema,
		options: gtFreeStackOptionSpecs,
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
	exec.command({
		name: "quiescence",
		description: "Preflight whether the current Graphite stack scope is safe to mutate.",
		schema: gtQuiescenceRequestSchema,
		resultSchema: gtQuiescenceResultSchema,
		handler: runGtQuiescence,
		renderHuman: renderGtQuiescence,
	});
	gt.group(exec);
	return gt;
}
