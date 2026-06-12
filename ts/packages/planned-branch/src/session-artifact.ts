import { z } from "zod";

import {
	BRANCH_CREATION_METHODS,
	formatPlannedBranchEvidence as formatPlanBranchEvidence,
	type PlannedBranchEvidence,
} from "./planned-branch-creation.ts";

export { formatPlanBranchEvidence };

export const PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE = "planned-branch-output";

export type PlannedBranchOutputStatus = "usage" | "dry-run" | "success" | "failure" | "cancelled";

export interface PlannedBranchOutputDetails {
	status: PlannedBranchOutputStatus;
	evidence?: PlannedBranchEvidence;
	error?: string;
}

const nonEmptyEvidenceStringSchema = z.string().min(1);

const plannedBranchEvidenceSchema = z.object({
	slug: nonEmptyEvidenceStringSchema,
	branch: nonEmptyEvidenceStringSchema,
	branchCreation: z.enum(BRANCH_CREATION_METHODS),
	startPoint: nonEmptyEvidenceStringSchema,
	namespace: nonEmptyEvidenceStringSchema,
	key: nonEmptyEvidenceStringSchema,
	refName: nonEmptyEvidenceStringSchema,
	commit: nonEmptyEvidenceStringSchema,
	sourceFile: nonEmptyEvidenceStringSchema,
	summary: z.string().optional(),
});

const successfulPlannedBranchOutputDetailsSchema = z.object({
	status: z.literal("success"),
	evidence: plannedBranchEvidenceSchema,
});

export function extractPlannedBranchEvidence(details: unknown): PlannedBranchEvidence | undefined {
	const result = successfulPlannedBranchOutputDetailsSchema.safeParse(details);
	if (!result.success) {
		return undefined;
	}

	return toPlannedBranchEvidence(result.data.evidence);
}

function toPlannedBranchEvidence(data: z.infer<typeof plannedBranchEvidenceSchema>): PlannedBranchEvidence {
	const { summary, ...evidence } = data;
	return { ...evidence, ...(summary === undefined ? {} : { summary }) };
}
