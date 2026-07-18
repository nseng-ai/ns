import type { BrmemErrorInfo, BrmemGateway } from "@nseng-ai/brmem";

import type { DispatchInstructionLocator } from "../dispatch/dispatch-context.ts";
import type { PreparedDispatchInstruction } from "./instruction-preparation.ts";

export interface DispatchSnapshotGateway {
	publishSnapshot(options: {
		readonly cwd: string;
		readonly remote: string;
		readonly snapshotRef: string;
		readonly commitSha: string;
	}): Promise<DispatchSnapshotOperationResult>;
	readRemoteSnapshotTip(options: {
		readonly cwd: string;
		readonly remote: string;
		readonly snapshotRef: string;
	}): Promise<DispatchRemoteSnapshotResult>;
}

export interface DispatchSnapshotError {
	readonly code: string;
	readonly message: string;
	readonly displayCommand?: string;
}

export type DispatchSnapshotOperationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: DispatchSnapshotError };

export type DispatchRemoteSnapshotResult =
	| { readonly type: "found"; readonly commitSha: string }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly error: DispatchSnapshotError };

export interface DispatchInstructionEntryArtifact {
	readonly type: "branch-memory-entry";
	readonly namespace: string;
	readonly key: string;
	readonly sourceBranch: string;
	readonly snapshotRef: string;
	readonly entryLocator: string;
	readonly commitSha: string;
}

export interface DispatchPublishedSnapshotArtifact {
	readonly type: "published-snapshot-ref";
	readonly remote: string;
	readonly snapshotRef: string;
	readonly commitSha: string;
}

export type DispatchInstructionDurableArtifact =
	| DispatchInstructionEntryArtifact
	| DispatchPublishedSnapshotArtifact;

export type DispatchInstructionDeliveryOutcome =
	| {
			readonly status: "entry-creation-failed";
			readonly dispatchId: string;
			readonly error: BrmemErrorInfo;
			readonly artifacts: readonly [];
	  }
	| {
			readonly status: "snapshot-publication-failed";
			readonly dispatchId: string;
			readonly error: DispatchSnapshotError;
			readonly artifacts: readonly [DispatchInstructionEntryArtifact];
	  }
	| {
			readonly status: "remote-verification-failed";
			readonly dispatchId: string;
			readonly error: DispatchSnapshotError;
			readonly artifacts: readonly [
				DispatchInstructionEntryArtifact,
				DispatchPublishedSnapshotArtifact,
			];
	  }
	| {
			readonly status: "remote-snapshot-mismatch";
			readonly dispatchId: string;
			readonly expectedCommitSha: string;
			readonly actualCommitSha: string | null;
			readonly artifacts: readonly [
				DispatchInstructionEntryArtifact,
				DispatchPublishedSnapshotArtifact,
			];
	  }
	| {
			readonly status: "ready";
			readonly dispatchId: string;
			readonly locator: DispatchInstructionLocator;
			readonly artifacts: readonly [
				DispatchInstructionEntryArtifact,
				DispatchPublishedSnapshotArtifact,
			];
	  };

/** Create once, publish the exact resulting Snapshot, and verify its remote tip. */
export async function deliverPreparedDispatchInstruction(
	request: { readonly cwd: string },
	preparation: PreparedDispatchInstruction,
	context: {
		readonly brmem: Pick<BrmemGateway, "createEntry">;
		readonly snapshots: DispatchSnapshotGateway;
	},
	remote: string,
): Promise<DispatchInstructionDeliveryOutcome> {
	const created = await context.brmem.createEntry({
		namespace: preparation.entry.namespace,
		key: preparation.entry.key,
		branch: preparation.entry.sourceBranch,
		content: preparation.content,
	});
	if (created.type === "error") {
		return {
			status: "entry-creation-failed",
			dispatchId: preparation.dispatchId,
			error: created.error,
			artifacts: [],
		};
	}

	const entryArtifact = buildEntryArtifact(preparation, created.value.commitSha);
	const published = await context.snapshots.publishSnapshot({
		cwd: request.cwd,
		remote,
		snapshotRef: preparation.entry.snapshotRef,
		commitSha: created.value.commitSha,
	});
	if (!published.ok) {
		return {
			status: "snapshot-publication-failed",
			dispatchId: preparation.dispatchId,
			error: published.error,
			artifacts: [entryArtifact],
		};
	}

	const publishedArtifact: DispatchPublishedSnapshotArtifact = {
		type: "published-snapshot-ref",
		remote,
		snapshotRef: preparation.entry.snapshotRef,
		commitSha: created.value.commitSha,
	};
	const artifacts = [entryArtifact, publishedArtifact] as const;
	const remoteTip = await context.snapshots.readRemoteSnapshotTip({
		cwd: request.cwd,
		remote,
		snapshotRef: preparation.entry.snapshotRef,
	});
	if (remoteTip.type === "error") {
		return {
			status: "remote-verification-failed",
			dispatchId: preparation.dispatchId,
			error: remoteTip.error,
			artifacts,
		};
	}
	const actualCommitSha = remoteTip.type === "found" ? remoteTip.commitSha : null;
	if (actualCommitSha !== created.value.commitSha.toLowerCase()) {
		return {
			status: "remote-snapshot-mismatch",
			dispatchId: preparation.dispatchId,
			expectedCommitSha: created.value.commitSha,
			actualCommitSha,
			artifacts,
		};
	}

	return {
		status: "ready",
		dispatchId: preparation.dispatchId,
		locator: {
			namespace: preparation.entry.namespace,
			dispatchId: preparation.dispatchId,
			key: preparation.entry.key,
			sourceBranch: preparation.entry.sourceBranch,
			snapshotRef: preparation.entry.snapshotRef,
			snapshotCommitSha: created.value.commitSha,
			entryLocator: preparation.entry.entryLocator,
		},
		artifacts,
	};
}

function buildEntryArtifact(
	preparation: PreparedDispatchInstruction,
	commitSha: string,
): DispatchInstructionEntryArtifact {
	return {
		type: "branch-memory-entry",
		namespace: preparation.entry.namespace,
		key: preparation.entry.key,
		sourceBranch: preparation.entry.sourceBranch,
		snapshotRef: preparation.entry.snapshotRef,
		entryLocator: preparation.entry.entryLocator,
		commitSha,
	};
}
