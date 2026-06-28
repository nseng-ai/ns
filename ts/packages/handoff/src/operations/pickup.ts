import { failure, ok } from "@sdl/clinkr";
import { z } from "zod";

import { readHandoffArtifact } from "../artifact-storage.ts";
import type { HandoffCliContext } from "../context.ts";
import { HANDOFF_NAMESPACE } from "../identity.ts";
import { handoffSummarySchema } from "../inventory.ts";
import { resolveBranch } from "./shared.ts";

export const pickupRequestSchema = z.object({
	slug: z.string().describe("Handoff slug."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
});

export const pickupResultSchema = z.object({
	namespace: z.literal(HANDOFF_NAMESPACE),
	branch: z.string(),
	slug: z.string(),
	key: z.string(),
	entry_locator: z.string(),
	summary: handoffSummarySchema.nullable(),
	content: z.string(),
});

export type PickupRequest = z.infer<typeof pickupRequestSchema>;
export type PickupResult = z.infer<typeof pickupResultSchema>;

export async function runPickup(ctx: HandoffCliContext, request: PickupRequest) {
	const branch = await resolveBranch(ctx, request.branch, {
		detachedMessage: "Cannot pick up handoff in detached HEAD; pass --branch <branch>.",
	});
	if (branch.type !== "resolved") return branch;

	const handoff = await readHandoffArtifact(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{ branch: branch.value, slug: request.slug },
	);
	if (handoff.type === "error") return failure(handoff.error.code, handoff.error.message);

	return ok({
		namespace: HANDOFF_NAMESPACE,
		branch: handoff.value.branch,
		slug: handoff.value.slug,
		key: handoff.value.key,
		entry_locator: handoff.value.entry_locator,
		summary: handoff.value.summary,
		content: handoff.value.content,
	} satisfies PickupResult);
}

export function renderPickup(result: PickupResult): string {
	const metadata = [
		`Handoff \`${result.slug}\` on branch \`${result.branch}\`.`,
		`Entry Locator: ${result.entry_locator}`,
		...(result.summary === null ? [] : [`Updated: ${result.summary.updated_at}`]),
	];
	return [...metadata, "", result.content].join("\n");
}
