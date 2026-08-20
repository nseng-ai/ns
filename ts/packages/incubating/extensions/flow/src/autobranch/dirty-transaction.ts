import type { AutobranchExec } from "./shared.ts";
import type { AutobranchGitGateway } from "./git-gateway.ts";
import { createGraphiteAutobranchProvider, type AutobranchProviderGateway } from "./provider.ts";
import {
	defineFailureCatalog,
	formatFailureCatalogEntry,
} from "../phase-stream/failure-catalog.ts";

export interface AutobranchTransactionInput {
	cwd: string;
	sourceBranch: string;
	branchName: string;
	checkpointMessage: string;
	exec: AutobranchExec;
	git: AutobranchGitGateway;
	provider?: AutobranchProviderGateway;
	commitPreparedCheckpointMessage: (
		message: string,
	) => Promise<{ summary: string } | { error: string }>;
	now?: () => number;
}

export type RecoveryCheckoutState =
	| { type: "branch"; name: string }
	| { type: "detached" }
	| { type: "error"; details: string };

export interface StashRecoveryFacts {
	stashRef: string;
	stashState: "retained" | "applied";
	current: RecoveryCheckoutState;
	sourceBranch: string;
	expectedSourceSha: string;
	childBranch: string;
	expectedChildSha: string;
	provider: "graphite" | "gh-stack";
	initialized: boolean;
	providerOutcome: "prepare-failed" | "add-absent" | "add-ambiguous" | "verified";
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
	| { ok: false; kind: "provider_prepare_refused"; error: string }
	| {
			ok: false;
			kind: "provider_prepare_failed";
			error: string;
			initialized: boolean;
			restored?: boolean;
			restoreError?: string;
			recovery?: StashRecoveryFacts;
	  }
	| {
			ok: false;
			kind: "provider_add_failed";
			addError: string;
			initialized: boolean;
			mutation: "absent" | "ambiguous";
			restored: true;
			recovery: StashRecoveryFacts;
	  }
	| {
			ok: false;
			kind: "provider_add_failed";
			addError: string;
			initialized: boolean;
			mutation: "absent" | "ambiguous";
			restored: false;
			restoreError: string;
			recovery: StashRecoveryFacts;
	  }
	| {
			ok: false;
			kind: "restore_failed_after_branch_create";
			restoreError: string;
			recovery: StashRecoveryFacts;
	  }
	| {
			ok: false;
			kind: "commit_failed_after_branch_create";
			commitError: string;
			recovery: StashRecoveryFacts;
	  };

export async function runAutobranchTransaction(
	input: AutobranchTransactionInput,
): Promise<AutobranchTransactionResult> {
	const provider =
		input.provider ?? createGraphiteAutobranchProvider({ exec: input.exec, git: input.git });
	const sourceBranch = input.sourceBranch;
	const preflight = await provider.preflightSource(sourceBranch);
	if (preflight.type === "refused-trunk") {
		return {
			ok: false,
			kind: "provider_prepare_refused",
			error: `Refusing to initialize github/gh-stack on Git trunk ${preflight.trunk}. Create or check out a non-trunk source branch first.`,
		};
	}
	if (preflight.type === "refused-non-top") {
		return {
			ok: false,
			kind: "provider_prepare_refused",
			error: `Source branch ${preflight.branch} is not the top of its github/gh-stack stack (top: ${preflight.top}).`,
		};
	}
	if (preflight.type === "failed") {
		return {
			ok: false,
			kind: "provider_prepare_failed",
			error: preflight.error,
			initialized: preflight.initialized,
		};
	}
	const originalSource = await input.git.branchSha(sourceBranch);
	if (originalSource.type !== "found") {
		return {
			ok: false,
			kind: "provider_prepare_failed",
			error:
				originalSource.type === "error"
					? originalSource.details
					: `Could not resolve source branch ${sourceBranch} before stashing pending changes.`,
			initialized: false,
		};
	}
	const expectedSourceSha = originalSource.sha;
	const stashMessage = `pi-autobranch:${input.now?.() ?? Date.now()}:${input.branchName}`;
	const stashed = await stashPendingChanges(input, stashMessage);
	if (!stashed.ok) {
		return stashed;
	}

	const prepared = await provider.prepareSource(sourceBranch);
	if (prepared.type !== "ready") {
		const initialized = prepared.type === "failed" && prepared.initialized;
		const recovery = await restoreStashAfterProviderMutation(input, {
			stashRef: stashed.ref,
			sourceBranch,
			expectedSourceSha,
			childBranch: input.branchName,
			expectedChildSha: expectedSourceSha,
			provider: provider.id,
			initialized,
			providerOutcome: "prepare-failed",
		});
		const restored = recovery.restore;
		const error =
			prepared.type === "failed"
				? prepared.error
				: `Provider source became ineligible before child creation (${prepared.type}).`;
		return restored.ok
			? {
					ok: false,
					kind: "provider_prepare_failed",
					error,
					initialized,
					restored: true,
					recovery: recovery.facts,
				}
			: {
					ok: false,
					kind: "provider_prepare_failed",
					error,
					initialized,
					restored: false,
					restoreError: restored.error,
					recovery: recovery.facts,
				};
	}

	const [sourceHead, childBeforeAdd] = await Promise.all([
		input.git.headSha(),
		input.git.branchSha(input.branchName),
	]);
	if (
		!sourceHead.ok ||
		sourceHead.value !== expectedSourceSha ||
		childBeforeAdd.type !== "absent"
	) {
		const probeError = !sourceHead.ok
			? sourceHead.details
			: sourceHead.value !== expectedSourceSha
				? `Expected source HEAD ${expectedSourceSha}, but found ${sourceHead.value}.`
				: formatUnexpectedChildProbe(input.branchName, childBeforeAdd);
		const recovery = await restoreStashAfterProviderMutation(input, {
			stashRef: stashed.ref,
			sourceBranch,
			expectedSourceSha,
			childBranch: input.branchName,
			expectedChildSha: expectedSourceSha,
			provider: provider.id,
			initialized: prepared.initialized,
			providerOutcome: "prepare-failed",
		});
		return recovery.restore.ok
			? {
					ok: false,
					kind: "provider_prepare_failed",
					error: probeError,
					initialized: prepared.initialized,
					restored: true,
					recovery: recovery.facts,
				}
			: {
					ok: false,
					kind: "provider_prepare_failed",
					error: `${probeError}\nPending changes remain in exact stash ${stashed.ref}; inspect it before continuing.`,
					initialized: prepared.initialized,
					restored: false,
					restoreError: recovery.restore.error,
					recovery: recovery.facts,
				};
	}
	const created = await provider.addChild({
		sourceBranch,
		childBranch: input.branchName,
		expectedSourceSha: sourceHead.value,
		expectedChildSha: sourceHead.value,
		initialized: prepared.initialized,
	});
	if (created.type !== "verified") {
		if (provider.id === "graphite") {
			const restored = await restoreStash(input, stashed.ref);
			return restored.ok
				? {
						ok: false,
						kind: "graphite_create_failed",
						createError: created.error,
						restored: true,
					}
				: {
						ok: false,
						kind: "graphite_create_failed",
						createError: created.error,
						restored: false,
						restoreError: restored.error,
					};
		}
		const recovery = await restoreStashAfterProviderMutation(input, {
			stashRef: stashed.ref,
			sourceBranch,
			expectedSourceSha,
			childBranch: input.branchName,
			expectedChildSha: sourceHead.value,
			provider: provider.id,
			initialized: created.initialized,
			providerOutcome: created.type === "absent" ? "add-absent" : "add-ambiguous",
		});
		const restored = recovery.restore;
		const common = {
			ok: false as const,
			kind: "provider_add_failed" as const,
			addError: created.error,
			initialized: created.initialized,
			mutation: created.type,
			recovery: recovery.facts,
		};
		if (restored.ok) return { ...common, restored: true };
		return { ...common, restored: false, restoreError: restored.error };
	}

	const restored = await restoreStash(input, stashed.ref);
	if (!restored.ok) {
		return {
			ok: false,
			kind: "restore_failed_after_branch_create",
			restoreError: restored.error,
			recovery: await collectStashRecoveryFacts(input, {
				stashRef: stashed.ref,
				stashState: "retained",
				sourceBranch,
				expectedSourceSha,
				childBranch: input.branchName,
				expectedChildSha: sourceHead.value,
				provider: provider.id,
				initialized: created.initialized,
				providerOutcome: "verified",
			}),
		};
	}

	const committed = await createCheckpointCommit(input);
	if ("error" in committed) {
		return {
			ok: false,
			kind: "commit_failed_after_branch_create",
			commitError: committed.error,
			recovery: await collectStashRecoveryFacts(input, {
				stashRef: stashed.ref,
				stashState: "applied",
				sourceBranch,
				expectedSourceSha,
				childBranch: input.branchName,
				expectedChildSha: sourceHead.value,
				provider: provider.id,
				initialized: created.initialized,
				providerOutcome: "verified",
			}),
		};
	}

	return { ok: true, commitSummary: committed.summary };
}

type TransactionExecutionInput = Pick<AutobranchTransactionInput, "git">;

type StashPendingChangesResult =
	| { ok: true; ref: string }
	| { ok: false; kind: "stash_failed"; error: string }
	| { ok: false; kind: "stash_ref_missing"; stashMessage: string; error: string };

async function stashPendingChanges(
	input: TransactionExecutionInput,
	message: string,
): Promise<StashPendingChangesResult> {
	const stashed = await input.git.stashPush(message);
	if (!stashed.ok) {
		return { ok: false, kind: "stash_failed", error: stashed.details };
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
	const listed = await input.git.listStashes();
	if (!listed.ok) {
		return { ok: false, error: listed.details };
	}
	for (const entry of listed.value) {
		if (entry.subject.includes(message)) {
			return { ok: true, ref: entry.ref };
		}
	}
	return { ok: false, error: "No matching stash entry found." };
}

type PendingStashRecoveryFacts = Omit<StashRecoveryFacts, "stashState" | "current">;

async function collectStashRecoveryFacts(
	input: TransactionExecutionInput,
	facts: Omit<StashRecoveryFacts, "current">,
): Promise<StashRecoveryFacts> {
	const current = await input.git.currentBranch();
	return {
		...facts,
		current: current.ok
			? current.value.type === "branch"
				? { type: "branch", name: current.value.name }
				: { type: "detached" }
			: { type: "error", details: current.details },
	};
}

async function restoreStashAfterProviderMutation(
	input: TransactionExecutionInput,
	facts: PendingStashRecoveryFacts,
): Promise<{
	facts: StashRecoveryFacts;
	restore: { ok: true } | { ok: false; error: string };
}> {
	const [current, sourceSha, childSha] = await Promise.all([
		input.git.currentBranch(),
		input.git.branchSha(facts.sourceBranch),
		input.git.branchSha(facts.childBranch),
	]);
	const retainedFacts = await collectStashRecoveryFacts(input, {
		...facts,
		stashState: "retained",
	});
	if (!current.ok) {
		return {
			facts: retainedFacts,
			restore: { ok: false, error: `Could not prove a safe stash destination: ${current.details}` },
		};
	}

	const sourceVerified = sourceSha.type === "found" && sourceSha.sha === facts.expectedSourceSha;
	const childVerified = childSha.type === "found" && childSha.sha === facts.expectedChildSha;
	const currentBranch = current.value.type === "branch" ? current.value.name : undefined;
	const sourceDestinationSafe =
		(facts.providerOutcome === "prepare-failed" || facts.providerOutcome === "add-absent") &&
		currentBranch === facts.sourceBranch &&
		sourceVerified &&
		childSha.type === "absent";
	const childDestinationSafe =
		facts.providerOutcome === "add-ambiguous" && childVerified && sourceVerified;

	if (sourceDestinationSafe) {
		const restore = await restoreStash(input, facts.stashRef);
		return {
			facts: restore.ok ? { ...retainedFacts, stashState: "applied" } : retainedFacts,
			restore,
		};
	}
	if (childDestinationSafe && currentBranch === facts.childBranch) {
		const restore = await restoreStash(input, facts.stashRef);
		return {
			facts: restore.ok ? { ...retainedFacts, stashState: "applied" } : retainedFacts,
			restore,
		};
	}
	if (childDestinationSafe && currentBranch === facts.sourceBranch) {
		const checkedOut = await input.git.checkout(facts.childBranch);
		if (!checkedOut.ok) {
			return { facts: retainedFacts, restore: { ok: false, error: checkedOut.details } };
		}
		const checkedCurrent = await input.git.currentBranch();
		const checkedChildSha = await input.git.branchSha(facts.childBranch);
		if (
			!checkedCurrent.ok ||
			checkedCurrent.value.type !== "branch" ||
			checkedCurrent.value.name !== facts.childBranch ||
			checkedChildSha.type !== "found" ||
			checkedChildSha.sha !== facts.expectedChildSha
		) {
			return {
				facts: await collectStashRecoveryFacts(input, { ...facts, stashState: "retained" }),
				restore: {
					ok: false,
					error: `Checked out ${facts.childBranch}, but could not re-verify its expected tip ${facts.expectedChildSha}; exact stash ${facts.stashRef} was retained.`,
				},
			};
		}
		const restore = await restoreStash(input, facts.stashRef);
		return {
			facts: await collectStashRecoveryFacts(input, {
				...facts,
				stashState: restore.ok ? "applied" : "retained",
			}),
			restore,
		};
	}
	return {
		facts: retainedFacts,
		restore: {
			ok: false,
			error: `Did not pop exact stash ${facts.stashRef}: a safe destination could not be proven (current=${formatRecoveryCheckout(retainedFacts.current)}, source=${facts.sourceBranch}@${facts.expectedSourceSha}, child=${facts.childBranch}@${facts.expectedChildSha}, provider=${facts.providerOutcome}).`,
		},
	};
}

function formatUnexpectedChildProbe(
	childBranch: string,
	probe: Awaited<ReturnType<AutobranchGitGateway["branchSha"]>>,
): string {
	switch (probe.type) {
		case "found":
			return `Child branch ${childBranch} appeared before provider mutation at ${probe.sha}.`;
		case "error":
			return probe.details;
		case "absent":
			throw new Error("Unexpected absent child probe in failure formatting.");
	}
}

async function restoreStash(
	input: TransactionExecutionInput,
	ref: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const restored = await input.git.stashPop(ref);
	if (!restored.ok) {
		return { ok: false, error: restored.details };
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
	provider_prepare_refused: {
		message: (failure) => failure.error,
	},
	provider_prepare_failed: {
		message: (failure) =>
			[
				failure.error,
				failure.initialized ? "github/gh-stack initialization was retained." : "",
				failure.restored === true ? "Restored pending changes." : "",
				failure.restored === false
					? `Could not restore pending changes: ${failure.restoreError ?? "unknown restore failure"}`
					: "",
				failure.recovery === undefined ? "" : formatStashRecovery(failure.recovery),
			]
				.filter(Boolean)
				.join("\n"),
	},
	provider_add_failed: {
		message: (failure, context) =>
			[
				`Failed to add provider child branch ${context.branchName}.`,
				failure.addError,
				failure.mutation === "ambiguous"
					? "Provider adoption may exist; preserved Git/provider state for recovery."
					: "No child/adoption was observed.",
				failure.initialized ? "github/gh-stack initialization was retained." : "",
				failure.restored
					? "Restored pending changes."
					: `Could not restore pending changes: ${failure.restoreError}`,
				formatStashRecovery(failure.recovery),
			]
				.filter(Boolean)
				.join("\n"),
	},
	restore_failed_after_branch_create: {
		message: (failure, context) =>
			[
				`Created branch ${context.branchName}, but failed to restore pending changes from the stash.`,
				failure.restoreError,
				"Inspect `git stash list` before continuing.",
				formatStashRecovery(failure.recovery),
			].join("\n"),
	},
	commit_failed_after_branch_create: {
		message: (failure, context) =>
			[
				`Branch ${context.branchName} exists, but checkpoint commit failed. Pending changes remain on that branch.`,
				failure.commitError,
				formatStashRecovery(failure.recovery),
			].join("\n"),
	},
});

function formatRecoveryCheckout(current: RecoveryCheckoutState): string {
	switch (current.type) {
		case "branch":
			return current.name;
		case "detached":
			return "detached";
		case "error":
			return `error (${current.details})`;
	}
}

function formatStashRecovery(facts: StashRecoveryFacts): string {
	return `Stash recovery facts: ref=${facts.stashRef} (${facts.stashState}); current=${formatRecoveryCheckout(facts.current)}; source=${facts.sourceBranch}@${facts.expectedSourceSha}; child=${facts.childBranch}@${facts.expectedChildSha}; provider=${facts.provider} (${facts.providerOutcome}); initialized=${facts.initialized}.`;
}

export function formatAutobranchTransactionFailure(
	result: AutobranchTransactionFailure,
	branchName: string,
): string {
	return formatFailureCatalogEntry(autobranchTransactionFailureCatalog, result, { branchName });
}
