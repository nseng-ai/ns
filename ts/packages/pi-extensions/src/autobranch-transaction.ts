import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";

import { formatCommandDetails, withStatus } from "./autobranch-shared.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GT_CREATE_TIMEOUT_MS = 120_000;
const STASH_PUSH_TIMEOUT_MS = 120_000;
const STASH_POP_TIMEOUT_MS = 120_000;

export interface AutobranchTransactionInput {
	cwd: string;
	branchName: string;
	checkpointMessage: string;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	commitPreparedCheckpointMessage: (message: string) => Promise<{ summary: string } | { error: string }>;
	setStatus: (message: string | undefined) => void;
	now?: () => number;
}

export type AutobranchTransactionResult =
	| { ok: true; commitSummary: string }
	| { ok: false; kind: "stash_failed"; error: string }
	| { ok: false; kind: "stash_ref_missing"; stashMessage: string; error: string }
	| { ok: false; kind: "graphite_create_failed"; createError: string; restored: true }
	| { ok: false; kind: "graphite_create_failed"; createError: string; restored: false; restoreError: string }
	| { ok: false; kind: "restore_failed_after_branch_create"; restoreError: string }
	| { ok: false; kind: "commit_failed_after_branch_create"; commitError: string };

export async function runAutobranchTransaction(input: AutobranchTransactionInput): Promise<AutobranchTransactionResult> {
	const stashMessage = `pi-autobranch:${input.now?.() ?? Date.now()}:${input.branchName}`;
	const stashed = await stashPendingChanges(input, stashMessage);
	if (!stashed.ok) {
		return stashed;
	}

	const created = await createGraphiteBranch(input);
	if (!created.ok) {
		const restored = await restoreStash(input, stashed.ref);
		if (restored.ok) {
			return { ok: false, kind: "graphite_create_failed", createError: created.error, restored: true };
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

type TransactionExecutionInput = Pick<AutobranchTransactionInput, "cwd" | "exec" | "setStatus">;

type StashPendingChangesResult =
	| { ok: true; ref: string }
	| { ok: false; kind: "stash_failed"; error: string }
	| { ok: false; kind: "stash_ref_missing"; stashMessage: string; error: string };

async function stashPendingChanges(input: TransactionExecutionInput, message: string): Promise<StashPendingChangesResult> {
	return withStatus(input, "stashing pending changes…", async () => {
		const stashed = await input.exec("git", ["stash", "push", "--include-untracked", "-m", message], input.cwd, STASH_PUSH_TIMEOUT_MS);
		if (stashed.code !== 0) {
			return { ok: false, kind: "stash_failed", error: formatCommandDetails(stashed) };
		}

		const ref = await findStashRef(input, message);
		if (!ref.ok) {
			return { ok: false, kind: "stash_ref_missing", stashMessage: message, error: ref.error };
		}
		return { ok: true, ref: ref.ref };
	});
}

async function findStashRef(input: TransactionExecutionInput, message: string): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
	const listed = await input.exec("git", ["stash", "list", "--format=%gd%x00%s"], input.cwd, GIT_FACT_TIMEOUT_MS);
	if (listed.code !== 0) {
		return { ok: false, error: formatCommandDetails(listed) };
	}
	for (const line of listed.stdout.split("\n")) {
		const [ref, subject] = line.split("\0");
		if (ref && subject?.includes(message)) {
			return { ok: true, ref };
		}
	}
	return { ok: false, error: "No matching stash entry found." };
}

async function createGraphiteBranch(input: Pick<AutobranchTransactionInput, "branchName" | "cwd" | "exec" | "setStatus">): Promise<{ ok: true } | { ok: false; error: string }> {
	return withStatus(input, `creating ${input.branchName}…`, async () => {
		const created = await input.exec("gt", ["create", input.branchName, "--no-interactive", "--no-ai"], input.cwd, GT_CREATE_TIMEOUT_MS);
		if (created.code !== 0) {
			return { ok: false, error: formatCommandDetails(created) };
		}
		return { ok: true };
	});
}

async function restoreStash(input: TransactionExecutionInput, ref: string): Promise<{ ok: true } | { ok: false; error: string }> {
	return withStatus(input, "restoring pending changes…", async () => {
		const restored = await input.exec("git", ["stash", "pop", ref], input.cwd, STASH_POP_TIMEOUT_MS);
		if (restored.code !== 0) {
			return { ok: false, error: formatCommandDetails(restored) };
		}
		return { ok: true };
	});
}

async function createCheckpointCommit(input: Pick<AutobranchTransactionInput, "checkpointMessage" | "commitPreparedCheckpointMessage" | "setStatus">): Promise<{ summary: string } | { error: string }> {
	return withStatus(input, "creating checkpoint commit…", () => input.commitPreparedCheckpointMessage(input.checkpointMessage));
}
