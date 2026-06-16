import { failure, ok, type ClinkrExit, type LegacyMachineOutput } from "@asdl/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { legacyMachine } from "./legacy-machine.ts";
import { matchesStatusFilter } from "./list-objectives.ts";

export const listCandidatesRequestSchema = z.object({});

export const objectiveCandidateRecordSchema = z.object({
	slug: z.string(),
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

export function legacyListCandidatesMachine(exit: ClinkrExit<ListCandidatesResult>): LegacyMachineOutput {
	return legacyMachine(exit);
}
