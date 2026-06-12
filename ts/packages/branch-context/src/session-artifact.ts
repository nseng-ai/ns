import { z } from "zod";

import { isRecord } from "@asdl/core/primitives";

import { BRANCH_CREATION_METHODS, type BranchContextEvidence } from "./branch-context-creation.ts";
import { BRANCH_CONTEXT_NAMESPACE } from "./constants.ts";

export const BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE = "branch-context-output";

export type BranchContextOutputDetails =
	| { status: "usage" }
	| { status: "dry-run"; targetBranch: string; key: string }
	| { status: "success"; evidence: BranchContextEvidence }
	| { status: "loaded-plan" }
	| { status: "reuse" }
	| { status: "failure"; error: string }
	| { status: "cancelled" };

export interface BranchContextOutputMessage {
	customType: typeof BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE;
	content: string;
	display: true;
	details: BranchContextOutputDetails;
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

export function buildBranchContextOutputMessage(content: string, details: BranchContextOutputDetails): BranchContextOutputMessage {
	return {
		customType: BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE,
		content,
		display: true,
		details,
	};
}

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

export function findLatestBranchContextEvidence(entries: readonly unknown[]): BranchContextEvidence | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const evidence = extractBranchContextEvidenceFromSessionEntry(entries[index]);
		if (evidence !== undefined && evidence.namespace === BRANCH_CONTEXT_NAMESPACE) {
			return evidence;
		}
	}
	return undefined;
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
