import { z } from "zod";

export const freedSlotSchema = z.object({
	slotName: z.string(),
	branchName: z.string(),
	worktreePath: z.string(),
});

export const cleanupSchema = z.object({
	slotName: z.string(),
	branchName: z.string(),
	action: z.union([z.literal("pr"), z.literal("local-branch")]),
	status: z.union([
		z.literal("planned"),
		z.literal("success"),
		z.literal("skipped"),
		z.literal("error"),
	]),
	prNumber: z.number().int().nullable(),
	message: z.string().nullable(),
});
