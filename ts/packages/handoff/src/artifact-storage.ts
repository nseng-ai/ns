import {
	brmemError,
	brmemOk,
	mustEntryLocator,
	type BrmemGateway,
	type BrmemReadGateway,
	type BrmemResult,
} from "@sdl/brmem";
import type { GitGateway } from "@sdl/git";

import {
	HANDOFF_NAMESPACE,
	handoffKeyFromSlug,
	handoffKeyToSlug,
	isHandoffKey,
} from "./identity.ts";
import type { BranchState, HandoffSummary } from "./inventory.ts";

export type HandoffReadBrmemGateway = BrmemReadGateway;
export type HandoffCheckBrmemGateway = Pick<BrmemReadGateway, "checkEntry">;
export type HandoffCreateBrmemGateway = Pick<BrmemGateway, "createEntry">;
export type HandoffDeleteBrmemGateway = Pick<BrmemGateway, "deleteEntry">;
export type HandoffBrmemGateway = HandoffReadBrmemGateway &
	HandoffCreateBrmemGateway &
	HandoffDeleteBrmemGateway;
export type HandoffGitGateway = Pick<GitGateway, "localBranchPresence">;

export interface HandoffReadStorageDeps {
	brmem: HandoffReadBrmemGateway;
	git: HandoffGitGateway;
	cwd: string;
}

export interface HandoffCheckStorageDeps {
	brmem: HandoffCheckBrmemGateway;
}

export interface HandoffCreateStorageDeps {
	brmem: HandoffCreateBrmemGateway;
}

export interface HandoffDeleteStorageDeps {
	brmem: HandoffDeleteBrmemGateway;
}

export interface HandoffStorageDeps {
	brmem: HandoffBrmemGateway;
	git: HandoffGitGateway;
	cwd: string;
}

export interface ListHandoffSummariesOptions {
	branch?: string | undefined;
	shouldIncludeDeleted: boolean;
}

export interface HandoffTarget {
	branch: string;
	slug: string;
	key: string;
	entryLocator: string;
}

export type HandoffCreationTarget = HandoffTarget;
export type HandoffDeletionTarget = HandoffTarget;
export type HandoffReadTarget = HandoffTarget;

export interface HandoffArtifactCheck extends HandoffTarget {
	exists: boolean;
}

export interface CreateHandoffArtifactResult extends HandoffCreationTarget {
	commit: string;
}

export interface DeleteHandoffArtifactResult extends HandoffDeletionTarget {
	commit: string;
}

export interface ReadHandoffArtifactResult extends HandoffReadTarget {
	content: string;
	summary: HandoffSummary | null;
}

export async function listHandoffSummaries(
	deps: HandoffReadStorageDeps,
	options: ListHandoffSummariesOptions,
): Promise<BrmemResult<readonly HandoffSummary[]>> {
	const entries = await deps.brmem.listEntries({
		namespace: HANDOFF_NAMESPACE,
		branch: options.branch,
	});
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
				branchState: state.value,
				slug: handoffKeyToSlug(entry.key),
				key: entry.key,
				entryLocator: entry.entryLocator,
				updatedAt: entry.updatedAt,
			},
			updatedTime: Date.parse(entry.updatedAt),
		});
	}

	handoffs.sort(
		(a, b) =>
			a.summary.branch.localeCompare(b.summary.branch) ||
			b.updatedTime - a.updatedTime ||
			a.summary.slug.localeCompare(b.summary.slug),
	);
	return brmemOk(handoffs.map((item) => item.summary));
}

export async function readHandoffArtifact(
	deps: HandoffReadStorageDeps,
	options: { branch: string; slug: string },
): Promise<BrmemResult<ReadHandoffArtifactResult>> {
	const key = handoffKeyFromSlug(options.slug);
	if (key.type === "error") {
		return brmemError(key.error.code, key.error.message);
	}

	const target = handoffTarget({ branch: options.branch, key: key.value });
	const summary = await findActiveHandoffSummary(deps, target);
	if (summary.type === "error") return summary;
	if (summary.value === null) {
		return brmemError("handoff-not-found", notFoundMessage(target));
	}

	const entry = await deps.brmem.getEntry({
		namespace: HANDOFF_NAMESPACE,
		key: target.key,
		branch: target.branch,
	});
	if (entry.type === "error") {
		return brmemError(entry.error.code, `Failed to read handoff: ${entry.error.message}`);
	}
	if (entry.type === "missing") {
		return brmemError("handoff-not-found", notFoundMessage(target));
	}

	return brmemOk({
		...target,
		content: entry.value.content,
		summary: summary.value,
	});
}

export async function checkHandoffArtifact(
	deps: HandoffCheckStorageDeps,
	options: { branch: string; slug: string },
): Promise<BrmemResult<HandoffArtifactCheck>> {
	const key = handoffKeyFromSlug(options.slug);
	if (key.type === "error") {
		return brmemError(key.error.code, key.error.message);
	}

	const target = handoffTarget({ branch: options.branch, key: key.value });
	const existing = await deps.brmem.checkEntry({
		namespace: HANDOFF_NAMESPACE,
		key: target.key,
		branch: target.branch,
	});
	if (existing.type === "error") {
		return brmemError(existing.error.code, `Failed to check handoff: ${existing.error.message}`);
	}
	return brmemOk({ ...target, exists: existing.type === "found" });
}

export async function prepareHandoffCreation(
	deps: HandoffCheckStorageDeps,
	options: { branch: string; slug: string },
): Promise<BrmemResult<HandoffCreationTarget>> {
	const checked = await checkHandoffArtifact(deps, options);
	if (checked.type === "error") return checked;
	if (checked.value.exists) {
		return brmemError("handoff-already-exists", alreadyExistsMessage(checked.value));
	}
	return brmemOk(targetFromCheck(checked.value));
}

export async function createHandoffArtifact(
	deps: HandoffCreateStorageDeps,
	options: { branch: string; key: string; content: string },
): Promise<BrmemResult<CreateHandoffArtifactResult>> {
	const target = handoffTarget(options);
	const created = await deps.brmem.createEntry({
		namespace: HANDOFF_NAMESPACE,
		key: target.key,
		branch: target.branch,
		content: options.content,
	});
	if (created.type === "error") {
		if (created.error.code === "key-already-exists") {
			return brmemError("handoff-already-exists", alreadyExistsMessage(target));
		}
		return brmemError(created.error.code, `Failed to create handoff: ${created.error.message}`);
	}
	return brmemOk({ ...target, commit: created.value.commitSha });
}

export async function prepareHandoffDeletion(
	deps: HandoffCheckStorageDeps,
	options: { branch: string; slug: string },
): Promise<BrmemResult<HandoffDeletionTarget>> {
	const checked = await checkHandoffArtifact(deps, options);
	if (checked.type === "error") return checked;
	if (!checked.value.exists) {
		return brmemError("handoff-not-found", notFoundMessage(checked.value));
	}
	return brmemOk(targetFromCheck(checked.value));
}

export async function deleteHandoffArtifact(
	deps: HandoffDeleteStorageDeps,
	options: { branch: string; key: string },
): Promise<BrmemResult<DeleteHandoffArtifactResult>> {
	const target = handoffTarget(options);
	const deleted = await deps.brmem.deleteEntry({
		namespace: HANDOFF_NAMESPACE,
		key: target.key,
		branch: target.branch,
	});
	if (deleted.type === "error") {
		if (deleted.error.code === "key-not-found") {
			return brmemError("handoff-not-found", notFoundMessage(target));
		}
		return brmemError(deleted.error.code, `Failed to delete handoff: ${deleted.error.message}`);
	}
	return brmemOk({ ...target, commit: deleted.value.commitSha });
}

async function classifyBranchState(
	deps: HandoffReadStorageDeps,
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

async function findActiveHandoffSummary(
	deps: HandoffReadStorageDeps,
	target: HandoffReadTarget,
): Promise<BrmemResult<HandoffSummary | null>> {
	const summaries = await listHandoffSummaries(deps, {
		branch: target.branch,
		shouldIncludeDeleted: false,
	});
	if (summaries.type === "error") return summaries;
	return brmemOk(
		summaries.value.find(
			(summary) => summary.key === target.key && summary.branch === target.branch,
		) ?? null,
	);
}

function targetFromCheck(checked: HandoffArtifactCheck): HandoffTarget {
	return {
		branch: checked.branch,
		slug: checked.slug,
		key: checked.key,
		entryLocator: checked.entryLocator,
	};
}

function handoffTarget(options: { branch: string; key: string }): HandoffTarget {
	return {
		branch: options.branch,
		slug: handoffKeyToSlug(options.key),
		key: options.key,
		entryLocator: mustEntryLocator(HANDOFF_NAMESPACE, options.key, options.branch),
	};
}

function alreadyExistsMessage(target: HandoffCreationTarget): string {
	return `Handoff \`${target.slug}\` already exists on branch \`${target.branch}\`.`;
}

function notFoundMessage(target: { slug: string; branch: string }): string {
	return `No handoff \`${target.slug}\` found on branch \`${target.branch}\`.`;
}
