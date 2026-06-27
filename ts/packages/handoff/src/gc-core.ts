import type { BrmemResult } from "@sdl/brmem";

import {
	deleteHandoffArtifact,
	type DeleteHandoffArtifactResult,
	type HandoffStorageDeps,
} from "./artifact-storage.ts";
import type { HandoffSummary } from "./inventory.ts";

export type DeletedBranchGarbageCollectionAction =
	| "kept_active"
	| "would_delete"
	| "deleted"
	| "error";

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

export type DeletedBranchGarbageCollectionPlan = DeletedBranchGarbageCollectionReport;
export type DeletedBranchGarbageCollectionResult = DeletedBranchGarbageCollectionReport;

export function planDeletedBranchGarbageCollection(options: {
	summaries: readonly HandoffSummary[];
}): DeletedBranchGarbageCollectionPlan {
	const entries = options.summaries.map((summary) =>
		createEntry(summary, summary.branch_state === "deleted" ? "would_delete" : "kept_active"),
	);
	return {
		entries,
		counts: countEntries(entries),
	};
}

export async function executeDeletedBranchGarbageCollection(
	deps: HandoffStorageDeps,
	plan: DeletedBranchGarbageCollectionPlan,
): Promise<DeletedBranchGarbageCollectionResult> {
	const entries: DeletedBranchGarbageCollectionEntry[] = [];
	for (const entry of plan.entries) {
		if (entry.action !== "would_delete") {
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
				result.error.code === "handoff_not_found"
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
	let wouldDelete = 0;
	let deleted = 0;
	let kept = 0;
	let error = 0;
	for (const entry of entries) {
		switch (entry.action) {
			case "would_delete":
				wouldDelete += 1;
				break;
			case "deleted":
				deleted += 1;
				break;
			case "error":
				error += 1;
				break;
			case "kept_active":
				kept += 1;
				break;
		}
	}
	return { wouldDelete, deleted, kept, error };
}
