import { z } from "zod";

export const saveSavedPlanRequestSchema = z.object({
	file: z.string().optional().describe("Markdown source file. Omit to read stdin."),
	summary: z.string().optional().describe("Optional one-sentence plan summary."),
});

export const saveSavedPlanResultSchema = z.object({
	slug: z.string(),
	repoRoot: z.string(),
	repoKey: z.string(),
	repoIdentitySource: z.enum(["origin-url", "repo-root"]),
	sourceBranch: z.string(),
	branchKey: z.string(),
	filePath: z.string(),
	summary: z.string().optional(),
	provider: z.string(),
	model: z.string(),
});

export type SaveSavedPlanRequest = z.infer<typeof saveSavedPlanRequestSchema>;
export type SaveSavedPlanResult = z.infer<typeof saveSavedPlanResultSchema>;
