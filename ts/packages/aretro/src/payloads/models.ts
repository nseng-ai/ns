/**
 * Framework-neutral payload-store models.
 */

import { z } from "zod";

export const payloadRoleSchema = z.enum(["raw", "summary", "log"]);
export type PayloadRole = z.infer<typeof payloadRoleSchema>;

export const payloadExtensionSchema = z.enum(["json", "txt"]);
export type PayloadExtension = z.infer<typeof payloadExtensionSchema>;

export const payloadReferenceSchema = z.object({
	payloadPath: z.string(),
	sessionId: z.string(),
	descriptor: z.string(),
	role: payloadRoleSchema,
	createdAtUtc: z.string(),
	sequence: z.number(),
	payloadBytes: z.number(),
	contentType: z.string(),
	extension: payloadExtensionSchema,
});

export type PayloadReference = z.infer<typeof payloadReferenceSchema>;
