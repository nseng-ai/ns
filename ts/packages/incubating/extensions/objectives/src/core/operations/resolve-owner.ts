import { negative, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr/legacy";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { isValidObjectiveOwner } from "../identity.ts";

/**
 * Deterministic creation-time owner resolution for the skill-owned Objective
 * creation workflow: explicit `--owner` wins and is validated offline (never
 * verified against GitHub); otherwise the authenticated GitHub login is used.
 * Read-only and non-interactive.
 */

export const resolveOwnerRequestSchema = z.object({
	owner: z
		.string()
		.optional()
		.describe("Explicit owner handle; validated offline and never verified against GitHub."),
});

export const resolveOwnerResultSchema = z.object({
	status: z.literal("ok"),
	owner: z.string(),
	source: z.enum(["explicit", "github-login"]),
});

export type ResolveOwnerRequest = z.infer<typeof resolveOwnerRequestSchema>;
export type ResolveOwnerResult = z.infer<typeof resolveOwnerResultSchema>;

export async function runResolveOwner(
	ctx: ObjectiveCliContext,
	request: ResolveOwnerRequest,
): Promise<ClinkrExit<ResolveOwnerResult>> {
	if (request.owner !== undefined) {
		if (!isValidObjectiveOwner(request.owner)) {
			return usageError(
				`Invalid Objective owner handle ${JSON.stringify(request.owner)}: expected lowercase alphanumerics with single internal hyphens (max 39 characters, no leading @).`,
				{ argument: "owner" },
			);
		}
		return ok({ status: "ok", owner: request.owner, source: "explicit" });
	}

	const resolved = await ctx.owner.resolveAuthenticatedOwner();
	if (resolved.type === "unavailable") {
		return negative(
			`${resolved.message} Pass an explicit --owner <handle> to resolve the Objective owner without authentication.`,
		);
	}
	return ok({ status: "ok", owner: resolved.owner, source: "github-login" });
}

export function renderResolveOwner(result: ResolveOwnerResult): string {
	return `Objective owner: ${result.owner} (source: ${result.source})`;
}
