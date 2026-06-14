import type { ListedEntry } from "@asdl/brmem";
import { failure, type ClinkrExit } from "@asdl/clinkr";
import type { GitGateway } from "@asdl/core/git";
import { z } from "zod";
import { handoffSlugFromKey, isHandoffKey } from "./identity.ts";
import { resolved, type Resolved } from "./operations/shared.ts";

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
	entries: readonly ListedEntry[];
	git: GitGateway;
	cwd: string;
	includeDeleted: boolean;
}

export async function collectHandoffSummaries(options: CollectHandoffSummariesOptions): Promise<Resolved<readonly HandoffSummary[]>> {
	const handoffs: { summary: HandoffSummary; updatedTime: number }[] = [];
	const branchStates = new Map<string, BranchState>();
	for (const entry of options.entries) {
		if (!isHandoffKey(entry.key)) continue;

		const state = await branchState({ branch: entry.branch, git: options.git, cwd: options.cwd, cache: branchStates });
		if (typeof state !== "string") return state;
		if (state === "deleted" && !options.includeDeleted) continue;

		const slug = handoffSlugFromKey(entry.key);
		handoffs.push({
			summary: {
				branch: entry.branch,
				branch_state: state,
				slug,
				key: entry.key,
				entry_locator: entry.entryLocator,
				updated_at: entry.updatedAt,
			},
			updatedTime: Date.parse(entry.updatedAt),
		});
	}

	handoffs.sort(
		(a, b) =>
			a.summary.branch.localeCompare(b.summary.branch)
			|| b.updatedTime - a.updatedTime
			|| a.summary.slug.localeCompare(b.summary.slug),
	);
	return resolved(handoffs.map((item) => item.summary));
}

async function branchState({
	branch,
	git,
	cwd,
	cache,
}: {
	branch: string;
	git: GitGateway;
	cwd: string;
	cache: Map<string, BranchState>;
}): Promise<BranchState | ClinkrExit<never>> {
	const existing = cache.get(branch);
	if (existing !== undefined) return existing;
	const presence = await git.localBranchPresence({ cwd, branch });
	if (presence.type === "error") return failure(presence.error.code, presence.error.message);
	const state: BranchState = presence.type === "present" ? "active" : "deleted";
	cache.set(branch, state);
	return state;
}
