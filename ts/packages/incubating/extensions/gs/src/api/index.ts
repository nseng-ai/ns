import { z } from "@nseng-ai/sdk";

import { gsRestackResultSchema } from "../core/restack/command.ts";

export const GS_PACKAGE_NAME = "@nseng-ai/gs";
export const GS_RESTACK_RESOLVE_COMMAND = {
	id: "restack-resolve",
	displayName: "gs restack-resolve",
	piSurface: "ns:gs:restack-resolve",
	skillName: "ns-gs-restack-resolve",
	argvPrefix: ["gs", "restack-resolve"] as const,
	description: "Start or continue one local gh-stack restack step.",
} as const;

export const gsRestackResolveEnvelopeSchema = z.lazy(() =>
	z.discriminatedUnion("status", [
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
	]),
);
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
