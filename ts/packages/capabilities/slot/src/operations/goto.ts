import { failure, negative, ok, type RenderCapabilities } from "@sdl/clinkr";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../core/context.ts";
import { buildSlotInventory, findBySlot } from "../core/inventory.ts";
import { prepareNavigation } from "../core/navigation-result.ts";
import { renderSlotNavigationSuccess } from "../core/navigation-presentation.ts";
import { poolSize } from "../core/inventory.ts";
import { resolveNum, resolveWt } from "../core/selectors.ts";

export const gotoRequestSchema = z.object({
	num: z.number().int().optional().describe("Slot number."),
	wt: z.string().optional().describe("Slot worktree name, e.g. slot-01."),
	clipboard: z.boolean().default(true).describe("Copy the cd command to the clipboard."),
});

export const gotoResultSchema = z.object({
	slotName: z.string(),
	branchName: z.string(),
	operation: z.string().nullable(),
	worktreePath: z.string(),
	cdCommand: z.string(),
	clipboardCopied: z.boolean(),
	clipboardSkipped: z.boolean(),
	clipboardFailureReason: z
		.union([z.literal("backend-missing"), z.literal("subprocess-error")])
		.nullable(),
	clipboardFailureDetail: z.string().nullable(),
});

export type GotoRequest = z.infer<typeof gotoRequestSchema>;
export type GotoResult = z.infer<typeof gotoResultSchema>;

export async function runGoto(ctx: SlotCliContext, request: GotoRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const inventory = await buildSlotInventory(repoCtx.git, {
		mainRepoRoot: repoCtx.repo.mainRepoRoot,
	});
	if (poolSize(inventory) === 0)
		return failure("pool-empty", "No managed slots configured. Run `slot init --size N` first.");
	if (request.num !== undefined && request.wt !== undefined)
		return failure("conflicting-slot-args", "Pass exactly one of -n/--num or -w/--wt, not both.");
	let slotName: string;
	if (request.num !== undefined) {
		const result = resolveNum(request.num, poolSize(inventory));
		if (result.type === "error") return failure("invalid-slot-num", result.message);
		slotName = result.slotName;
	} else if (request.wt !== undefined) {
		const result = resolveWt(request.wt);
		if (result.type === "error") return failure("invalid-slot-wt", result.message);
		slotName = result.slotName;
	} else {
		return failure("missing-slot-arg", "Pass one of -n/--num or -w/--wt to identify the slot.");
	}
	const record = findBySlot(inventory, slotName);
	if (record === null || record.branch === null)
		return negative(`${slotName} is not currently assigned. Run \`slot list\` to see the pool.`);
	if (!(await repoCtx.git.pathExists(record.path)))
		return failure(
			"worktree-missing",
			`Worktree for ${slotName} is missing at ${record.path}. Run \`sdl slot free --wt ${slotName}\` to clear the stale assignment.`,
		);
	const navigation = await prepareNavigation(repoCtx, record.path, {
		shouldCopyClipboard: request.clipboard,
		shouldWriteCdDirective: repoCtx.shouldWriteCdDirective,
	});
	return ok({
		slotName: slotName,
		branchName: record.branch,
		operation: record.operation,
		...navigation,
	});
}

export function renderGoto(
	result: GotoResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const operationSuffix = result.operation === null ? "" : ` (${result.operation} in progress)`;
	return renderSlotNavigationSuccess(
		{
			...result,
			headline: `${result.slotName} -> ${result.branchName}${operationSuffix}`,
		},
		caps,
	);
}
