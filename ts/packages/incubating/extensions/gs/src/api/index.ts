import { z } from "@nseng-ai/sdk";

import { gsAutobranchResultSchema } from "../core/autobranch.ts";
import { gsRestackResultSchema } from "../core/restack/command.ts";

export const GS_PACKAGE_NAME = "@nseng-ai/gs";
export const GS_AUTOBRANCH_COMMAND = {
	id: "autobranch",
	displayName: "gs autobranch",
	piSurface: "ns:gs:autobranch",
	skillName: "ns-gs-autobranch",
	argvPrefix: ["gs", "autobranch"] as const,
	description: "Move dirty work onto a GS child and checkpoint it.",
} as const;
export const GS_RESTACK_RESOLVE_COMMAND = {
	id: "restack-resolve",
	displayName: "gs restack-resolve",
	piSurface: "ns:gs:restack-resolve",
	skillName: "ns-gs-restack-resolve",
	argvPrefix: ["gs", "restack-resolve"] as const,
	description: "Start or continue one local gh-stack restack step.",
} as const;

export const gsAutobranchEnvelopeSchema = z.lazy(() =>
	z.discriminatedUnion("status", [
		z.strictObject({
			status: z.literal("success"),
			exitCode: z.literal(0),
			data: gsAutobranchResultSchema,
		}),
		z.strictObject({
			status: z.literal("negative"),
			exitCode: z.literal(1),
			message: z.string(),
			data: gsAutobranchResultSchema,
		}),
		z.strictObject({
			status: z.literal("failure"),
			exitCode: z.literal(2),
			errorType: z.string(),
			message: z.string(),
			data: gsAutobranchResultSchema.optional(),
		}),
		z.strictObject({
			status: z.literal("usage-error"),
			exitCode: z.literal(2),
			errorType: z.string(),
			message: z.string(),
			data: gsAutobranchResultSchema,
		}),
	]),
);
export type GsAutobranchEnvelope = z.infer<typeof gsAutobranchEnvelopeSchema>;

export const gsRestackResolveEnvelopeSchema = z.discriminatedUnion("status", [
	z.strictObject({
		status: z.literal("success"),
		exitCode: z.literal(0),
		data: gsRestackResultSchema,
	}),
	z.strictObject({
		status: z.literal("negative"),
		exitCode: z.literal(1),
		message: z.string(),
		data: gsRestackResultSchema,
	}),
	z.strictObject({
		status: z.literal("failure"),
		exitCode: z.literal(2),
		errorType: z.string(),
		message: z.string(),
		data: gsRestackResultSchema,
	}),
	z.strictObject({
		status: z.literal("usage-error"),
		exitCode: z.literal(2),
		errorType: z.string(),
		message: z.string(),
		data: gsRestackResultSchema,
	}),
]);
export type GsRestackResolveEnvelope = z.infer<typeof gsRestackResolveEnvelopeSchema>;

export type {
	GsLocalBranch,
	GsLocalInventory,
	GsLocalInventoryFailure,
	GsLocalInventoryFailureCode,
	GsLocalInventoryGateway,
	GsLocalInventoryOptions,
	GsLocalInventoryResult,
	GsLocalPullRequest,
	GsLocalStack,
} from "../core/local-inventory.ts";
