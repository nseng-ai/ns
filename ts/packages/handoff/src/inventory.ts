import { failure, type ClinkrExit } from "@asdl/clinkr";
import type { GitGateway } from "@asdl/core/git";
import { z } from "zod";

import type { HandoffBrmemGateway, HandoffEntryRef } from "./brmem-gateway.ts";
import { HANDOFF_NAMESPACE, handoffSlugFromKey, isHandoffKey } from "./identity.ts";

export const branchStateSchema = z.enum(["active", "deleted"]);
export type BranchState = z.infer<typeof branchStateSchema>;

export const handoffSummarySchema = z.object({
	branch: z.string(),
	branch_state: branchStateSchema,
	slug: z.string(),
	key: z.string(),
	entry_locator: z.string(),
	updated_at: z.string(),
});
export type HandoffSummary = z.infer<typeof handoffSummarySchema>;

export interface CollectHandoffSummariesOptions {
	entries: readonly HandoffEntryRef[];
	brmem: HandoffBrmemGateway;
	git: GitGateway;
	cwd: string;
	includeDeleted: boolean;
}

export type CollectHandoffSummariesResult = { type: "summaries"; value: readonly HandoffSummary[] } | ClinkrExit<never>;

export async function collectHandoffSummaries(options: CollectHandoffSummariesOptions): Promise<CollectHandoffSummariesResult> {
	const handoffs: { summary: HandoffSummary; updatedTime: number }[] = [];
	const branchStates = new Map<string, BranchState>();
	const seen = new Set<string>();
	for (const entry of options.entries) {
		if (entry.namespace !== HANDOFF_NAMESPACE || !isHandoffKey(entry.key)) continue;
		const identity = `${entry.branch}\0${entry.key}`;
		if (seen.has(identity)) continue;
		seen.add(identity);

		const state = await branchState(entry.branch, options.git, options.cwd, branchStates);
		if (typeof state !== "string") return state;
		if (state === "deleted" && !options.includeDeleted) continue;

		const slug = handoffSlugFromKey(entry.key);
		const updatedAt = await options.brmem.entryUpdatedAt({ namespace: entry.namespace, key: entry.key, branch: entry.branch });
		if (updatedAt.type === "error") return failure(updatedAt.error.code, updatedAt.error.message);
		if (updatedAt.type === "missing") {
			return failure(
				"handoff_updated_at_unavailable",
				`Cannot determine updated timestamp for handoff ${JSON.stringify(slug)} on branch ${JSON.stringify(entry.branch)}.`,
			);
		}
		const parsed = Date.parse(updatedAt.value);
		if (Number.isNaN(parsed)) {
			return failure(
				"handoff_updated_at_unavailable",
				`Cannot determine updated timestamp for handoff ${JSON.stringify(slug)} on branch ${JSON.stringify(entry.branch)}: gateway returned invalid timestamp ${JSON.stringify(updatedAt.value)}.`,
			);
		}
		handoffs.push({
			summary: {
				branch: entry.branch,
				branch_state: state,
				slug,
				key: entry.key,
				entry_locator: entry.entryLocator,
				updated_at: updatedAt.value,
			},
			updatedTime: parsed,
		});
	}

	handoffs.sort((left, right) => left.summary.slug.localeCompare(right.summary.slug));
	handoffs.sort((left, right) => right.updatedTime - left.updatedTime);
	handoffs.sort((left, right) => left.summary.branch.localeCompare(right.summary.branch));
	return { type: "summaries", value: handoffs.map((item) => item.summary) };
}

async function branchState(
	branch: string,
	git: GitGateway,
	cwd: string,
	cache: Map<string, BranchState>,
): Promise<BranchState | ClinkrExit<never>> {
	const existing = cache.get(branch);
	if (existing !== undefined) return existing;
	const presence = await git.localBranchPresence({ cwd, branch });
	if (presence.type === "error") return failure(presence.error.code, presence.error.message);
	const state: BranchState = presence.type === "present" ? "active" : "deleted";
	cache.set(branch, state);
	return state;
}
