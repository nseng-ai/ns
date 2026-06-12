import { z } from "zod";

import { isRecord } from "@asdl/core/primitives";

import {
	BRANCH_CREATION_METHODS,
	formatBranchContextEvidence as formatBranchContextEvidence,
	type BranchContextEvidence,
} from "./branch-context-creation.ts";

export { formatBranchContextEvidence };

export const BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE = "branch-context-output";

export type BranchContextOutputStatus = "usage" | "dry-run" | "success" | "failure" | "cancelled";

export interface BranchContextOutputDetails {
	status: BranchContextOutputStatus;
	evidence?: BranchContextEvidence;
	error?: string;
}

const nonEmptyEvidenceStringSchema = z.string().min(1);

const branchContextEvidenceSchema = z.object({
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

const successfulBranchContextOutputDetailsSchema = z.object({
	status: z.literal("success"),
	evidence: branchContextEvidenceSchema,
});

export function extractBranchContextEvidence(details: unknown): BranchContextEvidence | undefined {
	const result = successfulBranchContextOutputDetailsSchema.safeParse(details);
	if (!result.success) {
		return undefined;
	}

	return toBranchContextEvidence(result.data.evidence);
}

function toBranchContextEvidence(data: z.infer<typeof branchContextEvidenceSchema>): BranchContextEvidence {
	const { summary, ...evidence } = data;
	return { ...evidence, ...(summary === undefined ? {} : { summary }) };
}

export function extractBranchContextEvidenceFromSessionEntry(entry: unknown): BranchContextEvidence | undefined {
	const message = extractMessageFromEntry(entry);
	if (message === undefined || customTypeFromMessage(message) !== BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE) {
		return undefined;
	}
	return extractBranchContextEvidence(message.details);
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
