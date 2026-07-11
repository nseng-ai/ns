import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";

import type { LocalBranchRefReadResult } from "../git/local-ref-reader.ts";
import type { GraphiteMetadataDbAccess } from "./metadata.ts";

export const GRAPHITE_METADATA_UNAVAILABLE_REASONS = [
	"missing-db",
	"sqlite-unavailable",
	"read-failed",
	"read-timeout",
	"schema-mismatch",
	"not-a-git-repo",
	"no-current-branch",
	"branch-ref-read-failed",
] as const;
export type GraphiteMetadataUnavailableReason =
	(typeof GRAPHITE_METADATA_UNAVAILABLE_REASONS)[number];

export interface GraphiteMetadataLookupInput {
	commonGitDir: string;
	currentBranch: string;
}

export type GraphiteMetadataStatus =
	| {
			type: "tracked";
			currentBranch: string;
			parent: string | undefined;
			children: readonly string[];
			isCurrentTrunk: boolean;
			/**
			 * Non-trunk ancestor branches below the current branch. Omitted when the
			 * ancestor walk cannot complete (cycle or missing metadata row).
			 */
			downstackCount?: number;
			/**
			 * Distinct branches above the current branch reachable through live-ref
			 * child links, across all chains. Stale diamond links and cycles count
			 * each branch once. Optional only for wire tolerance; the loader always
			 * sets it on tracked branches.
			 */
			upstackCount?: number;
	  }
	| { type: "untracked"; currentBranch: string }
	| { type: "unavailable"; reason: GraphiteMetadataUnavailableReason; currentBranch?: string };

export interface GraphiteMetadataWorkerRequest {
	type: "load_graphite_metadata";
	input: GraphiteMetadataLookupInput;
}

export type GraphiteMetadataWorkerResponse =
	| { type: "success"; status: GraphiteMetadataStatus }
	| { type: "failure"; message: string };

export interface GraphiteMetadataWorkerHandle {
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: { message?: string; error?: unknown }) => void) | null;
	postMessage(message: GraphiteMetadataWorkerRequest): void;
	terminate(): unknown;
}

export type GraphiteMetadataWorkerFactory = () => GraphiteMetadataWorkerHandle;

export type GraphiteMetadataWorkerDiagnostic =
	| { type: "worker-create-failed"; error: unknown }
	| { type: "worker-malformed-response"; data: unknown }
	| { type: "worker-failure-response"; message: string }
	| { type: "worker-error"; message?: string; error?: unknown }
	| { type: "worker-post-message-failed"; error: unknown }
	| { type: "worker-timeout"; timeoutMs: number };

export interface LoadGraphiteMetadataStatusInWorkerOptions {
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	timeoutMs?: number;
	workerFactory?: GraphiteMetadataWorkerFactory;
	timers?: TimerScheduler;
	onDiagnostic?: (diagnostic: GraphiteMetadataWorkerDiagnostic) => void;
}

/**
 * Seam over live-branch enumeration so callers can fake it in tests. The default
 * reads loose refs and `packed-refs` directly from the filesystem, keeping the
 * passive worktree-status path free of git subprocesses.
 */
export interface GraphiteBranchAccess {
	listLocalBranches(commonGitDir: string): LocalBranchRefReadResult;
}

export interface LoadGraphiteMetadataStatusOptions {
	dbAccess?: GraphiteMetadataDbAccess;
	branchAccess?: GraphiteBranchAccess;
}

export { loadGraphiteMetadataStatus } from "./status-loader.ts";
export {
	graphiteMetadataWorkerRequestFromValue,
	graphiteMetadataWorkerResponseFromValue,
	loadGraphiteMetadataStatusInWorker,
	shutdownGraphiteMetadataWorker,
} from "./status-worker.ts";
