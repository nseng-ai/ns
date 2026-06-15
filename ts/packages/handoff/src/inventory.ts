import { z } from "zod";

export const branchStateSchema = z.enum(["active", "deleted"]);
export type BranchState = z.infer<typeof branchStateSchema>;

export const handoffSummarySchema = z.object({
	branch: z.string(),
	branch_state: branchStateSchema,
	slug: z.string(),
	key: z.string(),
	entry_locator: z.string(),
	updated_at: z.string(),
});
export type HandoffSummary = z.infer<typeof handoffSummarySchema>;
