import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { buildSlotInventory, poolSize, slotStatus } from "../inventory.ts";

export const listRequestSchema = z.object({});

export const slotRowSchema = z.object({
	slot_name: z.string(),
	branch: z.string().nullable(),
	operation: z.string().nullable(),
	worktree_path: z.string(),
	status: z.union([z.literal("assigned"), z.literal("available")]),
});

export const listResultSchema = z.object({
	pool_size: z.number().int().nonnegative(),
	rows: z.array(slotRowSchema),
	repo_name: z.string(),
});

export type ListRequest = z.infer<typeof listRequestSchema>;
export type ListResult = z.infer<typeof listResultSchema>;

export async function runList(ctx: SlotCliContext, _request: ListRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	return ok({
		pool_size: poolSize(inventory),
		repo_name: ctx.repo.repoName,
		rows: inventory.records.map((record) => ({
			slot_name: record.slotName,
			branch: record.branch,
			operation: record.operation,
			worktree_path: record.path,
			status: slotStatus(record),
		})),
	});
}

export function renderList(result: ListResult): string {
	if (result.rows.length === 0) return `No slots initialized for ${result.repo_name}.`;
	return result.rows.map((row) => `${row.slot_name}\t${row.status}\t${row.branch ?? ""}\t${row.operation === null ? "" : `${row.operation} in progress`}\t${row.worktree_path}`).join("\n");
}
