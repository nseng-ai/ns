import { z } from "zod";

/**
 * Evidence envelope: top-level structure returned by collect-evidence.
 */
export const evidenceEnvelopeSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
	repo: z.string(),
	query: z.object({
		branch: z.string(),
		session_root: z.string().optional(),
		max_sessions: z.number(),
		payload_mode: z.enum(["inline", "payload"]),
		payload_session_id: z.string().optional(),
	}),
	source: z.string(),
	aggregate_metrics: z.record(z.string(), z.unknown()).optional(),
	sessions: z.array(z.unknown()).optional(),
	warnings: z.array(z.string()).optional(),
	evidence_items: z.array(z.unknown()).optional(),
});

export type EvidenceEnvelope = z.infer<typeof evidenceEnvelopeSchema>;
