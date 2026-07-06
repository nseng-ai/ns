import type { ClinkrCommandSpec, ClinkrExit, RenderCapabilities } from "@nseng-ai/clinkr";
import { z } from "zod";

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
	claimRequestSchema,
	claimResultSchema,
	foreachRequestSchema,
	foreachResultSchema,
	freeRequestSchema,
	freeResultSchema,
	gcRequestSchema,
	gcResultSchema,
	gotoRequestSchema,
	gotoResultSchema,
	gtDownRequestSchema,
	gtDownResultSchema,
	gtFreeStackRequestSchema,
	gtFreeStackResultSchema,
	gtNavigationResultSchema,
	gtQuiescenceRequestSchema,
	gtQuiescenceResultSchema,
	gtStackBranchesRequestSchema,
	gtStackBranchesResultSchema,
	gtStackMapBranchesRequestSchema,
	gtStackMapBranchesResultSchema,
	gtUpRequestSchema,
	initRequestSchema,
	initResultSchema,
	listRequestSchema,
	listResultSchema,
	renderCheckout,
	renderClaim,
	renderForeach,
	renderFree,
	renderGc,
	renderGoto,
	renderGtDownNavigation,
	renderGtFreeStack,
	renderGtQuiescence,
	renderGtUpNavigation,
	renderInit,
	renderList,
	renderResize,
	renderStackBranches,
	renderStackMapBranches,
	resizeRequestSchema,
	resizeResultSchema,
	runCheckout,
	runClaim,
	runForeach,
	runFree,
	runGc,
	runGoto,
	runGtDown,
	runGtFreeStack,
	runGtQuiescence,
	runGtStackBranches,
	runGtStackMapBranches,
	runGtUp,
	runInit,
	runList,
	runResize,
} from "../lifecycle/operations/index.ts";

export type SlotCommandGroup = "root" | "gt" | "gt-exec";
export type SlotCompletionKind = "checkout-branches";

export interface SlotCommandSpec extends Omit<
	ClinkrCommandSpec<SlotCliContext, z.ZodObject, unknown>,
	"completionProvider" | "summary" | "description" | "resultSchema"
> {
	group: SlotCommandGroup;
	summary: string;
	description: string;
	resultSchema: z.ZodType<unknown>;
	completionKind?: SlotCompletionKind;
}

interface TypedSlotCommandSpec<S extends z.ZodObject, T> extends Omit<
	ClinkrCommandSpec<SlotCliContext, S, T>,
	"completionProvider" | "summary" | "description" | "resultSchema"
> {
	group: SlotCommandGroup;
	summary: string;
	description: string;
	resultSchema: z.ZodType<T>;
	completionKind?: SlotCompletionKind;
}

function slotCommandSpec<S extends z.ZodObject, T>(
	spec: TypedSlotCommandSpec<S, T>,
): SlotCommandSpec {
	return {
		group: spec.group,
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		schema: spec.schema,
		...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
		...(spec.options === undefined ? {} : { options: spec.options }),
		...(spec.completionKind === undefined ? {} : { completionKind: spec.completionKind }),
		resultSchema: spec.resultSchema,
		handler: async (
			ctx: SlotCliContext,
			request: z.output<z.ZodObject>,
		): Promise<ClinkrExit<unknown>> => await spec.handler(ctx, request as z.output<S>),
		...(spec.renderHuman === undefined
			? {}
			: {
					renderHuman: (data: unknown, caps: RenderCapabilities) =>
						spec.renderHuman?.(data as T, caps) ?? "",
				}),
		...(spec.renderMarkdown === undefined
			? {}
			: {
					renderMarkdown: (data: unknown, caps: RenderCapabilities) =>
						spec.renderMarkdown?.(data as T, caps) ?? "",
				}),
	};
}

export const slotCommandSpecs = [
	slotCommandSpec({
		group: "root",
		name: "list",
		summary: "List worktree pool slots derived from Git worktree state.",
		description: "List worktree pool slots derived from Git worktree state.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	}),
	slotCommandSpec({
		group: "root",
		name: "ls",
		summary: "Alias for list.",
		description: "Alias for list.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	}),
	slotCommandSpec({
		group: "root",
		name: "checkout",
		summary: "Check out a branch into an available pool slot worktree.",
		description: "Check out a branch into an available pool slot worktree.",
		schema: checkoutRequestSchema,
		positionals: { branchName: { position: 0 }, base: { position: 1 } },
		options: checkoutOptionSpecs,
		completionKind: "checkout-branches",
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	}),
	slotCommandSpec({
		group: "root",
		name: "co",
		summary: "Alias for checkout.",
		description: "Alias for checkout.",
		schema: checkoutRequestSchema,
		positionals: { branchName: { position: 0 }, base: { position: 1 } },
		options: checkoutOptionSpecs,
		completionKind: "checkout-branches",
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	}),
	slotCommandSpec({
		group: "root",
		name: "goto",
		summary: "Print/copy a cd command for a slot worktree.",
		description: "Print/copy a cd command for a slot worktree.",
		schema: gotoRequestSchema,
		options: gotoOptionSpecs,
		resultSchema: gotoResultSchema,
		handler: runGoto,
		renderHuman: renderGoto,
	}),
	slotCommandSpec({
		group: "root",
		name: "claim",
		summary: "Move a local branch into the current managed slot or lowest available slot.",
		description: "Move a local branch into the current managed slot or lowest available slot.",
		schema: claimRequestSchema,
		positionals: { branchName: { position: 0 } },
		resultSchema: claimResultSchema,
		handler: runClaim,
		renderHuman: renderClaim,
	}),
	slotCommandSpec({
		group: "root",
		name: "free",
		summary: "Free assigned slots back to the pool.",
		description: "Free assigned slots back to the pool.",
		schema: freeRequestSchema,
		options: freeOptionSpecs,
		resultSchema: freeResultSchema,
		handler: runFree,
		renderHuman: renderFree,
	}),
	slotCommandSpec({
		group: "root",
		name: "foreach",
		summary: "Run a command in every managed slot worktree.",
		description: "Run a command in every managed slot worktree.",
		schema: foreachRequestSchema,
		positionals: { command: { position: 0 } },
		options: foreachOptionSpecs,
		resultSchema: foreachResultSchema,
		handler: runForeach,
		renderHuman: renderForeach,
	}),
	slotCommandSpec({
		group: "root",
		name: "gc",
		summary: "Free slots whose pull requests have closed or merged.",
		description: "Free slots whose pull requests have closed or merged.",
		schema: gcRequestSchema,
		options: gcOptionSpecs,
		resultSchema: gcResultSchema,
		handler: runGc,
		renderHuman: renderGc,
	}),
	slotCommandSpec({
		group: "root",
		name: "init",
		summary: "Initialize the worktree pool with N detached slots at trunk.",
		description: "Initialize the worktree pool with N detached slots at trunk.",
		schema: initRequestSchema,
		options: sizeOptionSpecs,
		resultSchema: initResultSchema,
		handler: runInit,
		renderHuman: renderInit,
	}),
	slotCommandSpec({
		group: "root",
		name: "resize",
		summary: "Grow or shrink the worktree pool to --size slots.",
		description: "Grow or shrink the worktree pool to --size slots.",
		schema: resizeRequestSchema,
		options: sizeOptionSpecs,
		resultSchema: resizeResultSchema,
		handler: runResize,
		renderHuman: renderResize,
	}),
	slotCommandSpec({
		group: "gt",
		name: "up",
		summary: "Print/copy a cd command for the immediate upstack Graphite branch.",
		description: "Print/copy a cd command for the immediate upstack Graphite branch.",
		schema: gtUpRequestSchema,
		options: gtNavigationOptionSpecs,
		resultSchema: gtNavigationResultSchema,
		handler: runGtUp,
		renderHuman: renderGtUpNavigation,
	}),
	slotCommandSpec({
		group: "gt",
		name: "down",
		summary: "Print/copy a cd command for the immediate downstack Graphite branch.",
		description: "Print/copy a cd command for the immediate downstack Graphite branch.",
		schema: gtDownRequestSchema,
		options: gtNavigationOptionSpecs,
		resultSchema: gtDownResultSchema,
		handler: runGtDown,
		renderHuman: renderGtDownNavigation,
	}),
	slotCommandSpec({
		group: "gt",
		name: "free-stack",
		summary: "Release every assigned slot in the current Graphite stack except the current branch.",
		description:
			"Release every assigned slot in the current Graphite stack except the current branch.",
		schema: gtFreeStackRequestSchema,
		options: gtFreeStackOptionSpecs,
		resultSchema: gtFreeStackResultSchema,
		handler: runGtFreeStack,
		renderHuman: renderGtFreeStack,
	}),
	slotCommandSpec({
		group: "gt-exec",
		name: "stack-branches",
		summary: "Emit the current Graphite stack branch list for skill/agent invocation.",
		description: "Emit the current Graphite stack branch list for skill/agent invocation.",
		schema: gtStackBranchesRequestSchema,
		resultSchema: gtStackBranchesResultSchema,
		handler: runGtStackBranches,
		renderHuman: renderStackBranches,
	}),
	slotCommandSpec({
		group: "gt-exec",
		name: "stack-map-branches",
		summary: "Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
		description: "Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
		schema: gtStackMapBranchesRequestSchema,
		resultSchema: gtStackMapBranchesResultSchema,
		handler: runGtStackMapBranches,
		renderHuman: renderStackMapBranches,
	}),
	slotCommandSpec({
		group: "gt-exec",
		name: "quiescence",
		summary: "Preflight whether the current Graphite stack scope is safe to mutate.",
		description: "Preflight whether the current Graphite stack scope is safe to mutate.",
		schema: gtQuiescenceRequestSchema,
		resultSchema: gtQuiescenceResultSchema,
		handler: runGtQuiescence,
		renderHuman: renderGtQuiescence,
	}),
] as const;
