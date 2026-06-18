import { z } from "zod";

export const freedSlotSchema = z.object({ slot_name: z.string(), branch_name: z.string(), worktree_path: z.string() });

export const cleanupSchema = z.object({
	slot_name: z.string(),
	branch_name: z.string(),
	action: z.union([z.literal("pr"), z.literal("local_branch")]),
	status: z.union([z.literal("planned"), z.literal("success"), z.literal("skipped"), z.literal("error")]),
	pr_number: z.number().int().nullable(),
	message: z.string().nullable(),
});
