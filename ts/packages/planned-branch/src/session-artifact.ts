import { z } from "zod";

import { isRecord } from "@asdl/core/primitives";

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

export function extractPlannedBranchEvidenceFromSessionEntry(entry: unknown): PlannedBranchEvidence | undefined {
	const message = extractMessageFromEntry(entry);
	if (message === undefined || customTypeFromMessage(message) !== PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE) {
		return undefined;
	}
	return extractPlannedBranchEvidence(message.details);
}

function extractMessageFromEntry(entry: unknown): Record<string, unknown> | undefined {
	if (!isRecord(entry)) {
		return undefined;
	}
	if (isRecord(entry.message)) {
		return entry.message;
	}
	if (typeof entry.customType === "string" || entry.content !== undefined) {
		return entry;
	}
	return undefined;
}

function customTypeFromMessage(message: Record<string, unknown>): string | undefined {
	return typeof message.customType === "string" ? message.customType : undefined;
}
