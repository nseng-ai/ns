import { ok } from "@asdl/clinkr";
import { z } from "zod";

import type { AretroCliContext } from "../context.ts";
import { evidenceEnvelopeSchema, type EvidenceEnvelope } from "../contracts.ts";

export const collectEvidenceRequestSchema = z.object({
	repo: z.string().optional(),
	branch: z.string().optional(),
	session_root: z.string().optional(),
	max_sessions: z.number().default(20),
	payload_mode: z.enum(["inline", "payload"]).default("inline"),
	payload_session_id: z.string().optional(),
});

export type CollectEvidenceRequest = z.infer<typeof collectEvidenceRequestSchema>;

export const collectEvidenceResultSchema = evidenceEnvelopeSchema;

export type CollectEvidenceResult = z.infer<typeof collectEvidenceResultSchema>;

export async function runCollectEvidence(
	context: AretroCliContext,
	request: CollectEvidenceRequest,
) {
	const repo = request.repo ?? context.cwd;
	const branch = request.branch ?? "current-branch-placeholder";

	const envelope: EvidenceEnvelope = {
		success: true,
		repo,
		query: {
			branch,
			session_root: request.session_root,
			max_sessions: request.max_sessions,
			payload_mode: request.payload_mode,
			payload_session_id: request.payload_session_id,
		},
		source: "placeholder",
		aggregate_metrics: {},
		sessions: [],
		warnings: [],
		evidence_items: [],
	};

	return ok(envelope);
}

export function renderCollectEvidence(_result: CollectEvidenceResult): string {
	return "Placeholder: no evidence collected yet. This is a contract-only implementation.";
}
