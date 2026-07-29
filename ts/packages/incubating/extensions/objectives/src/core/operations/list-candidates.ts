import { failure, ok, type ClinkrExit } from "@nseng-ai/clinkr/legacy";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { matchesStatusFilter } from "./list-objectives.ts";

export const listCandidatesRequestSchema = z.object({
	allOwners: z
		.boolean()
		.default(false)
		.describe("Offer candidates for every discovered owner instead of the current owner."),
});

export const objectiveCandidateRecordSchema = z.object({
	owner: z.string(),
	slug: z.string(),
	/** Durable candidate value: the full Objective Locator `<owner>/<slug>`. */
	locator: z.string(),
	status: z.enum(["open", "closed"]),
});

export const listCandidatesResultSchema = z.object({
	records: z.array(objectiveCandidateRecordSchema),
});

export type ObjectiveCandidateRecord = z.infer<typeof objectiveCandidateRecordSchema>;
export type ListCandidatesResult = z.infer<typeof listCandidatesResultSchema>;
export type ListCandidatesRequest = z.infer<typeof listCandidatesRequestSchema>;

export async function runListCandidates(
	ctx: ObjectiveCliContext,
	request: ListCandidatesRequest,
): Promise<ClinkrExit<ListCandidatesResult>> {
	const inventory = await ctx.storage.checkoutInventory();
	if (!inventory.ok) return failure(inventory.error.code, inventory.error.message);

	// Candidate values are full locators, so an all-owner listing stays
	// unambiguous. Default scope is the current owner; when no authenticated
	// owner is available, completion degrades to every owner's records rather
	// than failing (this is not bare-slug fallback — values remain locators).
	let ownerFilter: string | null = null;
	if (!request.allOwners) {
		const currentOwner = await ctx.owner.resolveAuthenticatedOwner();
		if (currentOwner.type === "ok") ownerFilter = currentOwner.owner;
	}

	return ok({
		records: inventory.value.records
			.filter(
				(record) =>
					matchesStatusFilter(record.status, "active") &&
					(ownerFilter === null || record.owner === ownerFilter),
			)
			.map((record) => ({
				owner: record.owner,
				slug: record.slug,
				locator: record.locator,
				status: record.status,
			})),
	});
}

export function renderListCandidates(result: ListCandidatesResult): string {
	return result.records.map((record) => `${record.locator}\t${record.status}`).join("\n");
}
