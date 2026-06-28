import { z } from "zod";

export const branchStateSchema = z.enum(["active", "deleted"]);
export type BranchState = z.infer<typeof branchStateSchema>;

export const handoffSummarySchema = z.object({
	branch: z.string(),
	branchState: branchStateSchema,
	slug: z.string(),
	key: z.string(),
	entryLocator: z.string(),
	updatedAt: z.string(),
});
export type HandoffSummary = z.infer<typeof handoffSummarySchema>;
