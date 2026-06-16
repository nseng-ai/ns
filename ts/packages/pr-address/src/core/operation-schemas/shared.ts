import { z } from "zod";

export const nullableStringSchema = z.string().nullable();
export const nullableIntSchema = z.int().nullable();
export const nullableBooleanSchema = z.boolean().nullable();
export const prReviewStateSchema = z.enum(["PENDING", "COMMENTED", "APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
export const prStateSchema = z.enum(["OPEN", "CLOSED", "MERGED"]);

export const payloadReferenceSchema = z.object({
	payload_path: z.string(),
	session_id: z.string(),
	descriptor: z.string(),
	role: z.enum(["raw", "summary", "log"]),
	created_at_utc: z.string(),
	sequence: z.int(),
	payload_bytes: z.int(),
	content_type: z.string(),
	extension: z.enum(["json", "txt"]),
});
