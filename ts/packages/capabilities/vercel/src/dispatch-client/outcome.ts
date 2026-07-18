import type { DispatchGraphitePublicationStage } from "./contracts.ts";
import type {
	DispatchGraphitePublicationAttemptedReceipt,
	DispatchLifecycleReceipt,
	DispatchSourceRevalidationReason,
} from "./lifecycle.ts";
import type { DispatchPreflightCheck } from "./preflight.ts";
import type {
	DispatchInstructionDurableArtifact,
	DispatchInstructionEntryArtifact,
	DispatchPublishedSnapshotArtifact,
} from "./instruction-delivery.ts";
import type { DispatchInstructionLocator } from "../dispatch/dispatch-context.ts";
import type { BrmemErrorInfo } from "@nseng-ai/brmem";

/** The dispatch core outcome union; the command handler maps it to exit shapes. */
export type DispatchPromptOutcome =
	| {
			readonly status: "dispatched";
			readonly dispatchId?: string;
			readonly instructionLocator?: DispatchInstructionLocator;
			readonly artifacts?: readonly [
				DispatchInstructionEntryArtifact,
				DispatchPublishedSnapshotArtifact,
			];
			readonly revision: string;
			readonly sourceBranch: string;
			readonly workflowRunUrl: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "run-started" }>;
	  }
	| {
			readonly status: "setup-required" | "brmem-preflight-failed";
			readonly dispatchId: string;
			readonly remote: string;
			readonly message: string;
			readonly artifacts: readonly [];
			readonly setupCommand?: string;
	  }
	| {
			readonly status: "invalid-dispatch-context";
			readonly dispatchId: string;
			readonly message: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "pr-opened" }>;
	  }
	| {
			readonly status: "entry-creation-failed";
			readonly dispatchId: string;
			readonly error: BrmemErrorInfo;
			readonly artifacts: readonly [];
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "pr-opened" }>;
	  }
	| {
			readonly status: "snapshot-publication-failed" | "remote-verification-failed";
			readonly dispatchId: string;
			readonly error: { readonly code: string; readonly message: string };
			readonly artifacts: readonly DispatchInstructionDurableArtifact[];
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "pr-opened" }>;
	  }
	| {
			readonly status: "remote-snapshot-mismatch";
			readonly dispatchId: string;
			readonly expectedCommitSha: string;
			readonly actualCommitSha: string | null;
			readonly artifacts: readonly DispatchInstructionDurableArtifact[];
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "pr-opened" }>;
	  }
	| { readonly status: "dirty-tree"; readonly dirtyPaths: readonly string[] }
	| { readonly status: "preflight-failed"; readonly checks: readonly DispatchPreflightCheck[] }
	| { readonly status: "invalid-branch-slug-override"; readonly message: string }
	| { readonly status: "branch-slug-generation-failed"; readonly message: string }
	| {
			readonly status: "anchor-branch-availability-failed";
			readonly anchorBranch: string;
			readonly message: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "source" }>;
	  }
	| {
			readonly status: "anchor-branch-unavailable";
			readonly semanticSlug: string;
			readonly candidateLimit: number;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "source" }>;
	  }
	| {
			readonly status: "source-unusable";
			readonly code: "not-a-repository" | "detached-head" | "git-read-failed";
			readonly message: string;
	  }
	| {
			readonly status: "source-publication-plan-failed";
			readonly code: string;
			readonly message: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "source" }>;
	  }
	| {
			readonly status: "source-publication-force-required";
			readonly affectedBranches: readonly string[];
	  }
	| {
			readonly status: "source-publication-declined";
			readonly affectedBranches: readonly string[];
	  }
	| {
			readonly status: "source-push-failed";
			readonly sourceBranch: string;
			readonly message: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "source" }>;
	  }
	| {
			readonly status: "graphite-publication-failed";
			readonly stage: DispatchGraphitePublicationStage;
			readonly code: string;
			readonly message: string;
			readonly receipt: DispatchGraphitePublicationAttemptedReceipt;
	  }
	| {
			readonly status: "source-publication-verification-failed";
			readonly reason: DispatchSourceRevalidationReason;
			readonly message: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "source" }>;
			readonly checks?: readonly DispatchPreflightCheck[];
			readonly dirtyPaths?: readonly string[];
	  }
	| {
			readonly status: "source-revalidation-failed";
			readonly reason: DispatchSourceRevalidationReason;
			readonly message: string;
			readonly checks?: readonly DispatchPreflightCheck[];
			readonly dirtyPaths?: readonly string[];
	  }
	| {
			readonly status: "anchor-push-failed";
			readonly anchorBranch: string;
			readonly message: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "source" }>;
	  }
	| {
			readonly status: "anchor-pr-failed";
			readonly message: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "anchor-pushed" }>;
	  }
	| {
			readonly status: "trigger-failed";
			readonly code: string;
			readonly message: string;
			readonly receipt: Extract<DispatchLifecycleReceipt, { stage: "pr-opened" }>;
	  }
	| {
			readonly status: "run-id-stamp-failed";
			readonly message: string;
			readonly receipt:
				| Extract<DispatchLifecycleReceipt, { stage: "pr-opened" }>
				| Extract<DispatchLifecycleReceipt, { stage: "run-started" }>;
	  };
