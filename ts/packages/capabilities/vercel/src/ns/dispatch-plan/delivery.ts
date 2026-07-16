import type { BrmemErrorInfo, BrmemGateway } from "@nseng-ai/brmem";

import {
	preflightDispatchBrmemSetup,
	type DispatchBrmemSetupGateway,
} from "./delivery-preflight.ts";
import {
	prepareDispatchPlan,
	type DispatchPlanEntryPreparation,
	type DispatchPlanPreparationContext,
	type DispatchPlanPreparationOutcome,
} from "./preparation.ts";

export interface DispatchPlanSnapshotGateway {
	publishSnapshot(options: {
		readonly cwd: string;
		readonly remote: string;
		readonly snapshotRef: string;
		readonly commitSha: string;
	}): Promise<DispatchPlanSnapshotOperationResult>;
	readRemoteSnapshotTip(options: {
		readonly cwd: string;
		readonly remote: string;
		readonly snapshotRef: string;
	}): Promise<DispatchPlanRemoteSnapshotResult>;
}

export interface DispatchPlanSnapshotError {
	readonly code: string;
	readonly message: string;
	readonly displayCommand?: string;
}

export type DispatchPlanSnapshotOperationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: DispatchPlanSnapshotError };

export type DispatchPlanRemoteSnapshotResult =
	| { readonly type: "found"; readonly commitSha: string }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly error: DispatchPlanSnapshotError };

export interface DispatchPlanDeliveryContext extends DispatchPlanPreparationContext {
	readonly brmem: Pick<BrmemGateway, "createEntry"> & DispatchBrmemSetupGateway;
	readonly snapshots: DispatchPlanSnapshotGateway;
}

export interface DispatchPlanDeliveryEntryArtifact {
	readonly type: "branch-memory-entry";
	readonly namespace: string;
	readonly key: string;
	readonly sourceBranch: string;
	readonly snapshotRef: string;
	readonly entryLocator: string;
	readonly commitSha: string;
}

export interface DispatchPlanPublishedSnapshotArtifact {
	readonly type: "published-snapshot-ref";
	readonly remote: string;
	readonly snapshotRef: string;
	readonly commitSha: string;
}

export type DispatchPlanDurableArtifact =
	| DispatchPlanDeliveryEntryArtifact
	| DispatchPlanPublishedSnapshotArtifact;

export interface DispatchPlanContextLocator {
	readonly namespace: string;
	readonly dispatchId: string;
	readonly contextPrefix: string;
	readonly planKey: string;
	readonly sourceBranch: string;
	readonly snapshotRef: string;
	readonly snapshotCommitSha: string;
	readonly entryLocator: string;
}

type PreparationFailure = Exclude<DispatchPlanPreparationOutcome, { readonly status: "ready" }>;

export type DispatchPlanDeliveryOutcome =
	| PreparationFailure
	| {
			readonly status: "setup-required" | "preflight-failed";
			readonly dispatchId: string;
			readonly remote: string;
			readonly message: string;
			readonly artifacts: readonly [];
			readonly setupCommand?: string;
	  }
	| {
			readonly status: "entry-creation-failed";
			readonly dispatchId: string;
			readonly error: BrmemErrorInfo;
			readonly artifacts: readonly [];
	  }
	| {
			readonly status: "snapshot-publication-failed";
			readonly dispatchId: string;
			readonly error: DispatchPlanSnapshotError;
			readonly artifacts: readonly [DispatchPlanDeliveryEntryArtifact];
	  }
	| {
			readonly status: "remote-verification-failed";
			readonly dispatchId: string;
			readonly error: DispatchPlanSnapshotError;
			readonly artifacts: readonly [
				DispatchPlanDeliveryEntryArtifact,
				DispatchPlanPublishedSnapshotArtifact,
			];
	  }
	| {
			readonly status: "remote-snapshot-mismatch";
			readonly dispatchId: string;
			readonly expectedCommitSha: string;
			readonly actualCommitSha: string | null;
			readonly artifacts: readonly [
				DispatchPlanDeliveryEntryArtifact,
				DispatchPlanPublishedSnapshotArtifact,
			];
	  }
	| {
			readonly status: "ready";
			readonly dispatchId: string;
			readonly locator: DispatchPlanContextLocator;
			readonly artifacts: readonly [
				DispatchPlanDeliveryEntryArtifact,
				DispatchPlanPublishedSnapshotArtifact,
			];
	  };

export async function deliverDispatchPlan(
	request: { readonly cwd: string; readonly planRef: string; readonly remote?: string },
	context: DispatchPlanDeliveryContext,
): Promise<DispatchPlanDeliveryOutcome> {
	const preparation = await prepareDispatchPlan(request, context);
	if (preparation.status !== "ready") return preparation;

	const preflight = await preflightDispatchBrmemSetup(context.brmem, request.remote);
	if (preflight.status !== "ready") {
		return {
			status: preflight.status,
			dispatchId: preparation.dispatchId,
			remote: preflight.remote,
			message: preflight.message,
			artifacts: [],
			...(preflight.status === "setup-required" ? { setupCommand: preflight.setupCommand } : {}),
		};
	}

	const created = await context.brmem.createEntry({
		namespace: preparation.entry.namespace,
		key: preparation.entry.key,
		branch: preparation.entry.sourceBranch,
		content: preparation.entry.content,
	});
	if (created.type === "error") {
		return {
			status: "entry-creation-failed",
			dispatchId: preparation.dispatchId,
			error: created.error,
			artifacts: [],
		};
	}

	const entryArtifact = buildEntryArtifact(preparation.entry, created.value.commitSha);
	const published = await context.snapshots.publishSnapshot({
		cwd: request.cwd,
		remote: preflight.remote,
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

	const publishedArtifact: DispatchPlanPublishedSnapshotArtifact = {
		type: "published-snapshot-ref",
		remote: preflight.remote,
		snapshotRef: preparation.entry.snapshotRef,
		commitSha: created.value.commitSha,
	};
	const artifacts = [entryArtifact, publishedArtifact] as const;
	const remoteTip = await context.snapshots.readRemoteSnapshotTip({
		cwd: request.cwd,
		remote: preflight.remote,
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
			contextPrefix: `${preparation.dispatchId}/`,
			planKey: preparation.entry.key,
			sourceBranch: preparation.entry.sourceBranch,
			snapshotRef: preparation.entry.snapshotRef,
			snapshotCommitSha: created.value.commitSha,
			entryLocator: preparation.entry.entryLocator,
		},
		artifacts,
	};
}

function buildEntryArtifact(
	entry: DispatchPlanEntryPreparation,
	commitSha: string,
): DispatchPlanDeliveryEntryArtifact {
	return {
		type: "branch-memory-entry",
		namespace: entry.namespace,
		key: entry.key,
		sourceBranch: entry.sourceBranch,
		snapshotRef: entry.snapshotRef,
		entryLocator: entry.entryLocator,
		commitSha,
	};
}
