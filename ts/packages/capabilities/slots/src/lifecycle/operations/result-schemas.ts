import { z } from "zod";

export const freedSlotSchema = z.object({
	slotName: z.string(),
	branchName: z.string(),
	worktreePath: z.string(),
});

export const provisionNoticeSchema = z.object({
	kind: z.union([
		z.literal("config-error"),
		z.literal("missing-in-store"),
		z.literal("store-not-a-file"),
		z.literal("target-not-a-file"),
		z.literal("copy-failed"),
	]),
	path: z.string().nullable(),
	slotName: z.string().nullable(),
	message: z.string(),
});

export const placementProvisionSchema = z.object({
	copied: z.array(z.object({ slotName: z.string(), path: z.string() })),
	notices: z.array(provisionNoticeSchema),
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
