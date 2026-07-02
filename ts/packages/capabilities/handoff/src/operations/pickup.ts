import { failure, ok } from "@sdl/clinkr";
import { z } from "zod";

import { readHandoffArtifact } from "../core/artifact-storage.ts";
import type { HandoffCliContext } from "../core/context.ts";
import { HANDOFF_NAMESPACE } from "../core/identity.ts";
import { handoffSummarySchema } from "../core/inventory.ts";
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
	entryLocator: z.string(),
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
		entryLocator: handoff.value.entryLocator,
		summary: handoff.value.summary,
		content: handoff.value.content,
	} satisfies PickupResult);
}

export function renderPickup(result: PickupResult): string {
	const metadata = [
		`Handoff \`${result.slug}\` on branch \`${result.branch}\`.`,
		`Entry Locator: ${result.entryLocator}`,
		...(result.summary === null ? [] : [`Updated: ${result.summary.updatedAt}`]),
	];
	return [...metadata, "", result.content].join("\n");
}
