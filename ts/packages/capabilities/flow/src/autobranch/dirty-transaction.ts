import type { CommandResult } from "./shared.ts";
import { formatAutobranchCommandDetails } from "./shared.ts";
import {
	defineFailureCatalog,
	formatFailureCatalogEntry,
} from "../phase-stream/failure-catalog.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GT_CREATE_TIMEOUT_MS = 120_000;
const STASH_PUSH_TIMEOUT_MS = 120_000;
const STASH_POP_TIMEOUT_MS = 120_000;

export interface AutobranchTransactionInput {
	cwd: string;
	branchName: string;
	checkpointMessage: string;
	exec: (command: string, args: string[], timeout: number) => Promise<CommandResult>;
	commitPreparedCheckpointMessage: (
		message: string,
	) => Promise<{ summary: string } | { error: string }>;
	now?: () => number;
}

export type AutobranchTransactionResult =
	| { ok: true; commitSummary: string }
	| { ok: false; kind: "stash_failed"; error: string }
	| { ok: false; kind: "stash_ref_missing"; stashMessage: string; error: string }
	| { ok: false; kind: "graphite_create_failed"; createError: string; restored: true }
	| {
			ok: false;
			kind: "graphite_create_failed";
			createError: string;
			restored: false;
			restoreError: string;
	  }
	| { ok: false; kind: "restore_failed_after_branch_create"; restoreError: string }
	| { ok: false; kind: "commit_failed_after_branch_create"; commitError: string };

export async function runAutobranchTransaction(
	input: AutobranchTransactionInput,
): Promise<AutobranchTransactionResult> {
	const stashMessage = `pi-autobranch:${input.now?.() ?? Date.now()}:${input.branchName}`;
	const stashed = await stashPendingChanges(input, stashMessage);
	if (!stashed.ok) {
		return stashed;
	}

	const created = await createGraphiteBranch(input);
	if (!created.ok) {
		const restored = await restoreStash(input, stashed.ref);
		if (restored.ok) {
			return {
				ok: false,
				kind: "graphite_create_failed",
				createError: created.error,
				restored: true,
			};
		}
		return {
			ok: false,
			kind: "graphite_create_failed",
			createError: created.error,
			restored: false,
			restoreError: restored.error,
		};
	}

	const restored = await restoreStash(input, stashed.ref);
	if (!restored.ok) {
		return { ok: false, kind: "restore_failed_after_branch_create", restoreError: restored.error };
	}

	const committed = await createCheckpointCommit(input);
	if ("error" in committed) {
		return { ok: false, kind: "commit_failed_after_branch_create", commitError: committed.error };
	}

	return { ok: true, commitSummary: committed.summary };
}

type TransactionExecutionInput = Pick<AutobranchTransactionInput, "cwd" | "exec">;

type StashPendingChangesResult =
	| { ok: true; ref: string }
	| { ok: false; kind: "stash_failed"; error: string }
	| { ok: false; kind: "stash_ref_missing"; stashMessage: string; error: string };

async function stashPendingChanges(
	input: TransactionExecutionInput,
	message: string,
): Promise<StashPendingChangesResult> {
	const stashed = await input.exec(
		"git",
		["stash", "push", "--include-untracked", "-m", message],
		STASH_PUSH_TIMEOUT_MS,
	);
	if (stashed.code !== 0) {
		return { ok: false, kind: "stash_failed", error: formatAutobranchCommandDetails(stashed) };
	}

	const ref = await findStashRef(input, message);
	if (!ref.ok) {
		return { ok: false, kind: "stash_ref_missing", stashMessage: message, error: ref.error };
	}
	return { ok: true, ref: ref.ref };
}

async function findStashRef(
	input: TransactionExecutionInput,
	message: string,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
	const listed = await input.exec(
		"git",
		["stash", "list", "--format=%gd%x00%s"],
		GIT_FACT_TIMEOUT_MS,
	);
	if (listed.code !== 0) {
		return { ok: false, error: formatAutobranchCommandDetails(listed) };
	}
	for (const line of listed.stdout.split("\n")) {
		const [ref, subject] = line.split("\0");
		if (ref && subject?.includes(message)) {
			return { ok: true, ref };
		}
	}
	return { ok: false, error: "No matching stash entry found." };
}

async function createGraphiteBranch(
	input: Pick<AutobranchTransactionInput, "branchName" | "cwd" | "exec">,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const created = await input.exec(
		"gt",
		["create", input.branchName, "--no-interactive", "--no-ai"],
		GT_CREATE_TIMEOUT_MS,
	);
	if (created.code !== 0) {
		return { ok: false, error: formatAutobranchCommandDetails(created) };
	}
	return { ok: true };
}

async function restoreStash(
	input: TransactionExecutionInput,
	ref: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const restored = await input.exec("git", ["stash", "pop", ref], STASH_POP_TIMEOUT_MS);
	if (restored.code !== 0) {
		return { ok: false, error: formatAutobranchCommandDetails(restored) };
	}
	return { ok: true };
}

async function createCheckpointCommit(
	input: Pick<AutobranchTransactionInput, "checkpointMessage" | "commitPreparedCheckpointMessage">,
): Promise<{ summary: string } | { error: string }> {
	return input.commitPreparedCheckpointMessage(input.checkpointMessage);
}

type AutobranchTransactionFailure = Extract<AutobranchTransactionResult, { ok: false }>;

interface AutobranchTransactionFailureContext {
	branchName: string;
}

const autobranchTransactionFailureCatalog = defineFailureCatalog<
	AutobranchTransactionFailure,
	undefined,
	AutobranchTransactionFailureContext
>()({
	stash_failed: {
		message: (failure) =>
			[`Failed to stash pending changes before branch creation.`, failure.error].join("\n"),
	},
	stash_ref_missing: {
		message: (failure) =>
			[
				`Stashed pending changes, but could not find the new stash entry for ${failure.stashMessage}.`,
				"Inspect `git stash list` before continuing.",
				failure.error,
			].join("\n"),
	},
	graphite_create_failed: {
		message: (failure, context) =>
			[
				`Failed to create Graphite branch ${context.branchName}.`,
				failure.createError,
				failure.restored
					? "Restored pending changes to the original branch."
					: `Could not restore pending changes: ${failure.restoreError}`,
			].join("\n"),
	},
	restore_failed_after_branch_create: {
		message: (failure, context) =>
			[
				`Created branch ${context.branchName}, but failed to restore pending changes from the stash.`,
				failure.restoreError,
				"Inspect `git stash list` before continuing.",
			].join("\n"),
	},
	commit_failed_after_branch_create: {
		message: (failure, context) =>
			`Branch ${context.branchName} exists, but checkpoint commit failed. Pending changes remain on that branch.\n${failure.commitError}`,
	},
});

export function formatAutobranchTransactionFailure(
	result: AutobranchTransactionFailure,
	branchName: string,
): string {
	return formatFailureCatalogEntry(autobranchTransactionFailureCatalog, result, { branchName });
}
