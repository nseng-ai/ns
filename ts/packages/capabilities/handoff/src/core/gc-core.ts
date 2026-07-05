import type { BrmemResult } from "@nseng-ai/brmem";

import {
	deleteHandoffArtifact,
	type DeleteHandoffArtifactResult,
	type HandoffDeleteStorageDeps,
} from "./artifact-storage.ts";
import {
	deletedBranchGarbageCollectionMetadataForAction,
	type DeletedBranchGarbageCollectionAction,
} from "./gc-actions.ts";
import type { HandoffSummary } from "./inventory.ts";

export type { DeletedBranchGarbageCollectionAction } from "./gc-actions.ts";

export interface DeletedBranchGarbageCollectionEntry extends HandoffSummary {
	action: DeletedBranchGarbageCollectionAction;
	commit: string | null;
	message: string | null;
}

export interface DeletedBranchGarbageCollectionCounts {
	wouldDelete: number;
	deleted: number;
	kept: number;
	error: number;
}

export interface DeletedBranchGarbageCollectionReport {
	entries: readonly DeletedBranchGarbageCollectionEntry[];
	counts: DeletedBranchGarbageCollectionCounts;
}

export function planDeletedBranchGarbageCollection(options: {
	summaries: readonly HandoffSummary[];
}): DeletedBranchGarbageCollectionReport {
	const entries = options.summaries.map((summary) =>
		createEntry(summary, summary.branchState === "deleted" ? "wouldDelete" : "keptActive"),
	);
	return {
		entries,
		counts: countEntries(entries),
	};
}

export async function executeDeletedBranchGarbageCollection(
	deps: HandoffDeleteStorageDeps,
	plan: DeletedBranchGarbageCollectionReport,
): Promise<DeletedBranchGarbageCollectionReport> {
	const entries: DeletedBranchGarbageCollectionEntry[] = [];
	for (const entry of plan.entries) {
		if (entry.action !== "wouldDelete") {
			entries.push({ ...entry });
			continue;
		}

		const deleted = await deleteHandoffArtifact(deps, {
			branch: entry.branch,
			key: entry.key,
		});
		entries.push(entryFromDeletion(entry, deleted));
	}
	return {
		entries,
		counts: countEntries(entries),
	};
}

function createEntry(
	summary: HandoffSummary,
	action: DeletedBranchGarbageCollectionAction,
): DeletedBranchGarbageCollectionEntry {
	return {
		...summary,
		action,
		commit: null,
		message: null,
	};
}

function entryFromDeletion(
	entry: DeletedBranchGarbageCollectionEntry,
	result: BrmemResult<DeleteHandoffArtifactResult>,
): DeletedBranchGarbageCollectionEntry {
	if (result.type === "error") {
		return {
			...entry,
			action: "error",
			commit: null,
			message:
				result.error.code === "handoff-not-found"
					? `Handoff disappeared before deletion: ${result.error.message}`
					: result.error.message,
		};
	}
	return {
		...entry,
		action: "deleted",
		commit: result.value.commit,
		message: null,
	};
}

function countEntries(
	entries: readonly DeletedBranchGarbageCollectionEntry[],
): DeletedBranchGarbageCollectionCounts {
	const counts: DeletedBranchGarbageCollectionCounts = {
		wouldDelete: 0,
		deleted: 0,
		kept: 0,
		error: 0,
	};
	for (const entry of entries) {
		counts[deletedBranchGarbageCollectionMetadataForAction(entry.action).countKey] += 1;
	}
	return counts;
}
