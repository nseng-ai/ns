import { z } from "zod";

export type BranchSource = "explicit" | "git_current_branch" | "detached" | "unresolved";

export const collectEvidenceErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
});

export type CollectEvidenceError = z.infer<typeof collectEvidenceErrorSchema>;

export const repoContextDtoSchema = z.object({
	repo_root: z.string().nullable(),
	cwd: z.string(),
	branch: z.string().nullable(),
	branch_source: z.enum(["explicit", "git_current_branch", "detached", "unresolved"]),
});

export type RepoContextDto = z.infer<typeof repoContextDtoSchema>;

export const sessionQueryDtoSchema = z.object({
	repo_root: z.string().nullable(),
	session_root: z.string().nullable(),
	max_sessions: z.number().nullable(),
});

export type SessionQueryDto = z.infer<typeof sessionQueryDtoSchema>;

export const sessionSourceInfoDtoSchema = z.object({
	harness: z.string(),
	adapter_name: z.string(),
	record_format: z.string(),
});

export type SessionSourceInfoDto = z.infer<typeof sessionSourceInfoDtoSchema>;

export const sessionSourceRefDtoSchema = z.object({
	path: z.string().nullable(),
	uri: z.string().nullable(),
	line_number: z.number().nullable(),
});

export type SessionSourceRefDto = z.infer<typeof sessionSourceRefDtoSchema>;

export const sessionWarningDtoSchema = z.object({
	code: z.string(),
	message: z.string(),
	source_ref: sessionSourceRefDtoSchema.nullable(),
	harness: z.string().nullable(),
	adapter_name: z.string().nullable(),
});

export type SessionWarningDto = z.infer<typeof sessionWarningDtoSchema>;

export const sessionAssociationDtoSchema = z.object({
	repo_root: z.string().nullable(),
	cwd: z.string().nullable(),
	branch: z.string().nullable(),
	confidence: z.string(),
	evidence: z.array(z.string()),
});

export type SessionAssociationDto = z.infer<typeof sessionAssociationDtoSchema>;

export const messageCountsDtoSchema = z.object({
	user: z.number(),
	assistant: z.number(),
	tool_result: z.number(),
	command_execution: z.number(),
	system: z.number(),
	other: z.number(),
});

export type MessageCountsDto = z.infer<typeof messageCountsDtoSchema>;

export const sessionSummaryDtoSchema = z.object({
	session_id: z.string().nullable(),
	started_at_iso: z.string().nullable(),
	ended_at_iso: z.string().nullable(),
	source_ref: sessionSourceRefDtoSchema,
	association: sessionAssociationDtoSchema,
	message_counts: messageCountsDtoSchema,
	model_event_count: z.number(),
	tool_call_count: z.number(),
	tool_result_count: z.number(),
	command_execution_count: z.number(),
	usage_event_count: z.number(),
	warning_count: z.number(),
});

export type SessionSummaryDto = z.infer<typeof sessionSummaryDtoSchema>;

export const aggregateMetricsDtoSchema = z.object({
	session_count: z.number(),
	message_counts: messageCountsDtoSchema,
	tool_call_count: z.number(),
	tool_result_count: z.number(),
	command_execution_count: z.number(),
	usage_event_count: z.number(),
	warning_count: z.number(),
});

export type AggregateMetricsDto = z.infer<typeof aggregateMetricsDtoSchema>;

export const evidenceItemDtoSchema = z.object({
	kind: z.string(),
	subject: z.string().nullable(),
	summary: z.string(),
	count: z.number().nullable(),
	session_count: z.number().nullable(),
	source_refs: z.array(sessionSourceRefDtoSchema),
	metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export type EvidenceItemDto = z.infer<typeof evidenceItemDtoSchema>;

export const payloadReferenceSchema = z.object({
	payload_path: z.string(),
	session_id: z.string(),
	descriptor: z.string(),
	role: z.enum(["raw", "summary", "log"]),
	created_at_utc: z.string(),
	sequence: z.number(),
	payload_bytes: z.number(),
	content_type: z.string(),
	extension: z.enum(["json", "txt"]),
});

export type PayloadReference = z.infer<typeof payloadReferenceSchema>;

export const collectEvidenceResultSchema = z.object({
	success: z.boolean(),
	error: collectEvidenceErrorSchema.nullable(),
	repo: repoContextDtoSchema,
	query: sessionQueryDtoSchema,
	source: sessionSourceInfoDtoSchema,
	aggregate_metrics: aggregateMetricsDtoSchema,
	sessions: z.array(sessionSummaryDtoSchema),
	warnings: z.array(sessionWarningDtoSchema),
	evidence_items: z.array(evidenceItemDtoSchema),
	payload_mode: z.enum(["inline", "payload"]).optional(),
	payload_reference: payloadReferenceSchema.optional(),
	detail_locator_hints: z.array(z.string()).optional(),
});

export type CollectEvidenceResult = z.infer<typeof collectEvidenceResultSchema>;

export const evidenceEnvelopeSchema = collectEvidenceResultSchema;
export type EvidenceEnvelope = CollectEvidenceResult;
