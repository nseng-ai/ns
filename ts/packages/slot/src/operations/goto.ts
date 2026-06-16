import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { buildSlotInventory, findBySlot } from "../inventory.ts";
import { buildNavigationResultFields } from "../navigation-result.ts";
import { poolSize } from "../inventory.ts";
import { resolveNum, resolveWt } from "../selectors.ts";

export const gotoRequestSchema = z.object({
	num: z.number().int().optional().describe("Slot number."),
	wt: z.string().optional().describe("Slot worktree name, e.g. slot-01."),
	clipboard: z.boolean().default(true).describe("Copy the cd command to the clipboard."),
});

export const gotoResultSchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	operation: z.string().nullable(),
	worktree_path: z.string(),
	cd_command: z.string(),
	clipboard_copied: z.boolean(),
	clipboard_skipped: z.boolean(),
	clipboard_failure_reason: z.union([z.literal("backend_missing"), z.literal("subprocess_error")]).nullable(),
	clipboard_failure_detail: z.string().nullable(),
});

export type GotoRequest = z.infer<typeof gotoRequestSchema>;
export type GotoResult = z.infer<typeof gotoResultSchema>;

export async function runGoto(ctx: SlotCliContext, request: GotoRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (poolSize(inventory) === 0) return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	if (request.num !== undefined && request.wt !== undefined) return failure("conflicting_slot_args", "Pass exactly one of -n/--num or -w/--wt, not both.");
	let slotName: string;
	if (request.num !== undefined) {
		const result = resolveNum(request.num, poolSize(inventory));
		if (result.type === "error") return failure("invalid_slot_num", result.message);
		slotName = result.slotName;
	} else if (request.wt !== undefined) {
		const result = resolveWt(request.wt);
		if (result.type === "error") return failure("invalid_slot_wt", result.message);
		slotName = result.slotName;
	} else {
		return failure("missing_slot_arg", "Pass one of -n/--num or -w/--wt to identify the slot.");
	}
	const record = findBySlot(inventory, slotName);
	if (record === null || record.branch === null) return negative(`${slotName} is not currently assigned. Run \`slot list\` to see the pool.`);
	if (!(await ctx.git.pathExists(record.path))) return failure("worktree_missing", `Worktree for ${slotName} is missing at ${record.path}. Run \`slot free --wt ${slotName}\` to clear the stale assignment.`);
	const navigation = await buildNavigationResultFields(ctx, { worktreePath: record.path, noClipboard: !request.clipboard });
	return ok({ slot_name: slotName, branch_name: record.branch, operation: record.operation, ...navigation });
}

export function renderGoto(result: GotoResult): string {
	const operationSuffix = result.operation === null ? "" : ` (${result.operation} in progress)`;
	const lines = [`${result.slot_name} -> ${result.branch_name}${operationSuffix}`, result.cd_command];
	if (!result.clipboard_skipped) {
		lines.push(result.clipboard_copied ? "Copied cd command to clipboard." : `Clipboard unavailable (${result.clipboard_failure_detail ?? "pbcopy failed"})`);
	}
	return lines.join("\n");
}
