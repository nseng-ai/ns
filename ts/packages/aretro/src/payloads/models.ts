/**
 * Framework-neutral payload-store models.
 */

import { z } from "zod";

export const payloadRoleSchema = z.enum(["raw", "summary", "log"]);
export type PayloadRole = z.infer<typeof payloadRoleSchema>;

export const payloadExtensionSchema = z.enum(["json", "txt"]);
export type PayloadExtension = z.infer<typeof payloadExtensionSchema>;

export const payloadReferenceSchema = z.object({
	payload_path: z.string(),
	session_id: z.string(),
	descriptor: z.string(),
	role: payloadRoleSchema,
	created_at_utc: z.string(),
	sequence: z.number(),
	payload_bytes: z.number(),
	content_type: z.string(),
	extension: payloadExtensionSchema,
});

export type PayloadReference = z.infer<typeof payloadReferenceSchema>;
