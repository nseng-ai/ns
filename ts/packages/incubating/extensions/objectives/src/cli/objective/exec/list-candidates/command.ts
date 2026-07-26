import { failure, ok, type ClinkrExit } from "@nseng-ai/clinkr";

import {
	listCandidatesRequestSchema,
	listCandidatesResultSchema,
	type ListCandidatesRequest,
	type ListCandidatesResult,
} from "../../../../core/candidate-listing.ts";
import type { ObjectiveCliContext } from "../../../../core/context.ts";
import { matchesStatusFilter } from "../../../../core/objective-list.ts";
import { objectiveNsCommand } from "../../../../ns/objective-command.ts";

export async function command() {
	return objectiveNsCommand({
		schema: listCandidatesRequestSchema,
		resultSchema: listCandidatesResultSchema,
		handler: runListCandidates,
		renderHuman: renderListCandidates,
	});
}

export async function runListCandidates(
	ctx: ObjectiveCliContext,
	request: ListCandidatesRequest,
): Promise<ClinkrExit<ListCandidatesResult>> {
	void request;
	const inventory = await ctx.storage.checkoutInventory();
	if (!inventory.ok) return failure(inventory.error.code, inventory.error.message);

	return ok({
		records: inventory.value.records
			.filter((record) => matchesStatusFilter(record.status, "active"))
			.map((record) => ({ slug: record.slug, status: record.status })),
	});
}

export function renderListCandidates(result: ListCandidatesResult): string {
	return result.records.map((record) => `${record.slug}\t${record.status}`).join("\n");
}
