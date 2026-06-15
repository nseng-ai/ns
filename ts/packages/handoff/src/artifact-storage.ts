import { brmemError, brmemOk, mustEntryLocator, type BrmemGateway, type BrmemResult } from "@asdl/brmem";
import type { GitGateway } from "@asdl/core/git";

import {
	HANDOFF_NAMESPACE,
	handoffKeyFromSlug,
	handoffKeyToSlug,
	isHandoffKey,
} from "./identity.ts";
import type { BranchState, HandoffSummary } from "./inventory.ts";

export interface HandoffStorageDeps {
	brmem: BrmemGateway;
	git: GitGateway;
	cwd: string;
}

export interface ListHandoffSummariesOptions {
	branch?: string | undefined;
	shouldIncludeDeleted: boolean;
}

export interface HandoffDeletionTarget {
	branch: string;
	slug: string;
	key: string;
	entry_locator: string;
}

export interface DeleteHandoffArtifactResult extends HandoffDeletionTarget {
	commit: string;
}

export async function listHandoffSummaries(
	deps: HandoffStorageDeps,
	options: ListHandoffSummariesOptions,
): Promise<BrmemResult<readonly HandoffSummary[]>> {
	const entries = await deps.brmem.listEntries({ namespace: HANDOFF_NAMESPACE, branch: options.branch });
	if (entries.type === "error") {
		return brmemError(entries.error.code, `Failed to list handoffs: ${entries.error.message}`);
	}

	const handoffs: { summary: HandoffSummary; updatedTime: number }[] = [];
	const branchStates = new Map<string, BranchState>();
	for (const entry of entries.value) {
		if (!isHandoffKey(entry.key)) continue;

		const state = await classifyBranchState(deps, entry.branch, branchStates);
		if (state.type === "error") return state;
		if (state.value === "deleted" && !options.shouldIncludeDeleted) continue;

		handoffs.push({
			summary: {
				branch: entry.branch,
				branch_state: state.value,
				slug: handoffKeyToSlug(entry.key),
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
	return brmemOk(handoffs.map((item) => item.summary));
}

export async function prepareHandoffDeletion(
	deps: HandoffStorageDeps,
	options: { branch: string; slug: string },
): Promise<BrmemResult<HandoffDeletionTarget>> {
	const key = handoffKeyFromSlug(options.slug);
	if (key.type === "error") {
		return brmemError(key.error.code, key.error.message);
	}

	const target = deletionTarget({ branch: options.branch, key: key.value });
	const existing = await deps.brmem.checkEntry({ namespace: HANDOFF_NAMESPACE, key: target.key, branch: target.branch });
	if (existing.type === "error") {
		return brmemError(existing.error.code, `Failed to check handoff: ${existing.error.message}`);
	}
	if (existing.type === "missing") {
		return brmemError("handoff_not_found", notFoundMessage(target));
	}
	return brmemOk(target);
}

export async function deleteHandoffArtifact(
	deps: HandoffStorageDeps,
	options: { branch: string; key: string },
): Promise<BrmemResult<DeleteHandoffArtifactResult>> {
	const target = deletionTarget(options);
	const deleted = await deps.brmem.deleteEntry({ namespace: HANDOFF_NAMESPACE, key: target.key, branch: target.branch });
	if (deleted.type === "error") {
		if (deleted.error.code === "key_not_found") {
			return brmemError("handoff_not_found", notFoundMessage(target));
		}
		return brmemError(deleted.error.code, `Failed to delete handoff: ${deleted.error.message}`);
	}
	return brmemOk({ ...target, commit: deleted.value.commitSha });
}

async function classifyBranchState(
	deps: HandoffStorageDeps,
	branch: string,
	cache: Map<string, BranchState>,
): Promise<BrmemResult<BranchState>> {
	const existing = cache.get(branch);
	if (existing !== undefined) return brmemOk(existing);

	const presence = await deps.git.localBranchPresence({ cwd: deps.cwd, branch });
	if (presence.type === "error") return brmemError(presence.error.code, presence.error.message);

	const state: BranchState = presence.type === "present" ? "active" : "deleted";
	cache.set(branch, state);
	return brmemOk(state);
}

function deletionTarget(options: { branch: string; key: string }): HandoffDeletionTarget {
	return {
		branch: options.branch,
		slug: handoffKeyToSlug(options.key),
		key: options.key,
		entry_locator: mustEntryLocator(HANDOFF_NAMESPACE, options.key, options.branch),
	};
}

function notFoundMessage(target: HandoffDeletionTarget): string {
	return `No handoff \`${target.slug}\` found on branch \`${target.branch}\`.`;
}

