import { z } from "zod";

import { payloadReferenceSchema, type PayloadReference } from "./payloads/models.ts";
import { SESSION_ASSOCIATION_CONFIDENCES, type SessionSourceRef } from "./sessions/types.ts";

export { payloadReferenceSchema };
export type { PayloadReference };

export type BranchSource = "explicit" | "git-current-branch" | "detached" | "unresolved";

export const collectEvidenceErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
});

export type CollectEvidenceError = z.infer<typeof collectEvidenceErrorSchema>;

export const repoContextDtoSchema = z.object({
	repoRoot: z.string().nullable(),
	cwd: z.string(),
	branch: z.string().nullable(),
	branchSource: z.enum(["explicit", "git-current-branch", "detached", "unresolved"]),
});

export type RepoContextDto = z.infer<typeof repoContextDtoSchema>;

export const sessionQueryDtoSchema = z.object({
	repoRoot: z.string().nullable(),
	sessionRoot: z.string().nullable(),
	maxSessions: z.number().nullable(),
});

export type SessionQueryDto = z.infer<typeof sessionQueryDtoSchema>;

export const sessionSourceInfoDtoSchema = z.object({
	harness: z.string(),
	adapterName: z.string(),
	recordFormat: z.string(),
});

export type SessionSourceInfoDto = z.infer<typeof sessionSourceInfoDtoSchema>;

export const sessionSourceRefDtoSchema = z.object({
	path: z.string().nullable(),
	uri: z.string().nullable(),
	lineNumber: z.number().nullable(),
});

export type SessionSourceRefDto = z.infer<typeof sessionSourceRefDtoSchema>;

export function sessionSourceRefToDto(sourceRef: SessionSourceRef): SessionSourceRefDto {
	return {
		path: sourceRef.path,
		uri: sourceRef.uri,
		lineNumber: sourceRef.line_number,
	};
}

export function optionalSessionSourceRefToDto(
	sourceRef: SessionSourceRef | null,
): SessionSourceRefDto | null {
	if (sourceRef === null) return null;
	return sessionSourceRefToDto(sourceRef);
}

export const sessionWarningDtoSchema = z.object({
	code: z.string(),
	message: z.string(),
	sourceRef: sessionSourceRefDtoSchema.nullable(),
	harness: z.string().nullable(),
	adapterName: z.string().nullable(),
});

export type SessionWarningDto = z.infer<typeof sessionWarningDtoSchema>;

export const sessionAssociationDtoSchema = z.object({
	repoRoot: z.string().nullable(),
	cwd: z.string().nullable(),
	branch: z.string().nullable(),
	confidence: z.enum(SESSION_ASSOCIATION_CONFIDENCES),
	evidence: z.array(z.string()),
});

export type SessionAssociationDto = z.infer<typeof sessionAssociationDtoSchema>;

export const messageCountsDtoSchema = z.object({
	user: z.number(),
	assistant: z.number(),
	toolResult: z.number(),
	commandExecution: z.number(),
	system: z.number(),
	other: z.number(),
});

export type MessageCountsDto = z.infer<typeof messageCountsDtoSchema>;

export const sessionSummaryDtoSchema = z.object({
	sessionId: z.string().nullable(),
	startedAtIso: z.string().nullable(),
	endedAtIso: z.string().nullable(),
	sourceRef: sessionSourceRefDtoSchema,
	association: sessionAssociationDtoSchema,
	messageCounts: messageCountsDtoSchema,
	modelEventCount: z.number(),
	toolCallCount: z.number(),
	toolResultCount: z.number(),
	commandExecutionCount: z.number(),
	usageEventCount: z.number(),
	warningCount: z.number(),
});

export type SessionSummaryDto = z.infer<typeof sessionSummaryDtoSchema>;

export const aggregateMetricsDtoSchema = z.object({
	sessionCount: z.number(),
	messageCounts: messageCountsDtoSchema,
	toolCallCount: z.number(),
	toolResultCount: z.number(),
	commandExecutionCount: z.number(),
	usageEventCount: z.number(),
	warningCount: z.number(),
});

export type AggregateMetricsDto = z.infer<typeof aggregateMetricsDtoSchema>;

export const evidenceItemDtoSchema = z.object({
	kind: z.string(),
	subject: z.string().nullable(),
	summary: z.string(),
	count: z.number().nullable(),
	sessionCount: z.number().nullable(),
	sourceRefs: z.array(sessionSourceRefDtoSchema),
	metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export type EvidenceItemDto = z.infer<typeof evidenceItemDtoSchema>;

export const sessionResultBoundsDtoSchema = z.object({
	appliedLimit: z.number(),
	returnedCount: z.number(),
	isComplete: z.boolean(),
	hasMore: z.boolean(),
	continuation: z
		.object({
			kind: z.enum(["increase-max-sessions", "narrow-session-root", "none"]),
			message: z.string(),
		})
		.nullable(),
});

export type SessionResultBoundsDto = z.infer<typeof sessionResultBoundsDtoSchema>;

export const detailAccessDtoSchema = z.object({
	mode: z.enum(["inline", "payload"]),
	guidance: z.string(),
	locatorHints: z.array(z.string()),
});

export type DetailAccessDto = z.infer<typeof detailAccessDtoSchema>;

export const outputBoundsDtoSchema = z.object({
	sessions: sessionResultBoundsDtoSchema,
	detail: detailAccessDtoSchema,
});

export type OutputBoundsDto = z.infer<typeof outputBoundsDtoSchema>;

export const collectEvidenceResultSchema = z.object({
	success: z.boolean(),
	error: collectEvidenceErrorSchema.nullable(),
	repo: repoContextDtoSchema,
	query: sessionQueryDtoSchema,
	source: sessionSourceInfoDtoSchema,
	aggregateMetrics: aggregateMetricsDtoSchema,
	sessions: z.array(sessionSummaryDtoSchema),
	warnings: z.array(sessionWarningDtoSchema),
	evidenceItems: z.array(evidenceItemDtoSchema),
	outputBounds: outputBoundsDtoSchema,
	payloadMode: z.enum(["inline", "payload"]).optional(),
	payloadReference: payloadReferenceSchema.optional(),
	detailLocatorHints: z.array(z.string()).optional(),
});

export type CollectEvidenceResult = z.infer<typeof collectEvidenceResultSchema>;

export const evidenceEnvelopeSchema = collectEvidenceResultSchema;
export type EvidenceEnvelope = CollectEvidenceResult;
