import { z } from "zod";

export const listCandidatesRequestSchema = z.object({});

export const objectiveCandidateRecordSchema = z.object({
	slug: z.string(),
	status: z.enum(["open", "closed"]),
});

export const listCandidatesResultSchema = z.object({
	records: z.array(objectiveCandidateRecordSchema),
});

export type ObjectiveCandidateRecord = z.infer<typeof objectiveCandidateRecordSchema>;
export type ListCandidatesResult = z.infer<typeof listCandidatesResultSchema>;
export type ListCandidatesRequest = z.infer<typeof listCandidatesRequestSchema>;
