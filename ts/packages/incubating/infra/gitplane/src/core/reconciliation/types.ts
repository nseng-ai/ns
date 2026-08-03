import type {
	ArtifactGateway,
	MaterializationStoreGateway,
	ReconciliationMode,
} from "../gateways.ts";
import type { ArtifactKindRegistration, Clock } from "../domain.ts";

export interface ReconcileContext {
	readonly artifacts: ArtifactGateway;
	readonly store: MaterializationStoreGateway;
	readonly clock: Clock;
}

export interface ReconcileOptions {
	readonly sourceId: string;
	readonly artifactRoot: string;
	readonly target: string;
	readonly full?: boolean;
	readonly kinds?: readonly ArtifactKindRegistration[];
}

export interface ReconciliationTransitionCounts {
	readonly created: number;
	readonly restored: number;
	readonly revised: number;
	readonly moved: number;
	readonly unchanged: number;
	readonly deleted: number;
}

export interface ReconcileData {
	readonly sourceId: string;
	readonly targetCommit: string;
	readonly previousCursor: string | null;
	readonly mode: ReconciliationMode;
	readonly status: "reconciled" | "already-current";
	readonly transitions: ReconciliationTransitionCounts;
	readonly eventReconstruction: "complete" | "skipped" | "not-applicable";
	readonly cursorAdvanced: boolean;
	readonly errorsResolved: number;
}

export interface ReconcileFailure {
	readonly code: string;
	readonly message: string;
	readonly phase: "read" | "plan" | "apply" | "cleanup";
	readonly operation?: string;
	readonly subject?: string;
	readonly targetCommit?: string;
	readonly cursorAdvanced: boolean;
}

export type ReconcileResult =
	| { readonly ok: true; readonly data: ReconcileData }
	| { readonly ok: false; readonly failure: ReconcileFailure };
