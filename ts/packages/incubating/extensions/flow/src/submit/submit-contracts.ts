import type {
	ExecOutputListener,
	ExecOutputStream,
	ExecResult,
} from "@nseng-ai/foundation/command";

import type { SubmitPrLink } from "./gt-output.ts";
import type { SubmitPlan } from "./submit-plan.ts";
import type { SubmitPrInventoryPreview } from "./submit-pr-inventory-summary.ts";
export type CurrentPrVerificationFailureCause =
	| "startup_error"
	| "timeout"
	| "command_failed"
	| "malformed_output";

export interface SubmitSemanticFailureCause {
	kind: "empty_branch_skipped";
	branchName?: string;
}

export interface RemoteSyncDiagnostics {
	upstream: string;
	aheadCount?: number;
	behindCount?: number;
	remoteOnlyCommits?: readonly string[];
}

export type SubmitPreflightFailureCause =
	| { kind: "trunk_out_of_date" }
	| { kind: "merged_pr_not_in_trunk" }
	| { kind: "graphite_pr_info_lookup_failed" }
	| {
			kind: "remote_updated_outside_graphite";
			branchName?: string;
			remoteSync?: RemoteSyncDiagnostics;
	  }
	| SubmitSemanticFailureCause;

export type SubmitCommandOutput = ExecResult;
export type SubmitOutputStream = ExecOutputStream;
export type SubmitOutputListener = ExecOutputListener;

export interface SubmitCommandParams {
	cwd: string;
	onOutput?: SubmitOutputListener;
	force?: boolean;
}

export type SubmitFailurePresentation = "deterministic" | "unknown";

export interface SubmitFailureTranscriptCommand {
	commandDisplay?: string;
	stdout: string;
	stderr: string;
	termination: ExecResult["type"];
	exitCode: number | null;
	signal?: string | null;
	error?: string;
}

export interface SubmitFailureTranscript {
	phase: string;
	summary?: string;
	details?: readonly string[];
	commands: readonly SubmitFailureTranscriptCommand[];
}

export type SubmitPreflightResult =
	| { kind: "ready"; output: SubmitCommandOutput }
	| { kind: "restack_required"; output: SubmitCommandOutput }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
			cause?: SubmitPreflightFailureCause;
	  };

export type SubmitRestackResult =
	| { kind: "success"; output: SubmitCommandOutput }
	| { kind: "conflict"; output: SubmitCommandOutput; conflictedFiles: string[] }
	| { kind: "failed"; output: SubmitCommandOutput };

export type SubmitRunResult =
	| {
			kind: "success";
			output: SubmitCommandOutput;
			prLinks: SubmitPrLink[];
			semanticFailureCause?: SubmitSemanticFailureCause;
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
			cause?: SubmitPreflightFailureCause;
	  };

export type CurrentPrVerificationResult =
	| {
			kind: "present";
			output: SubmitCommandOutput;
			prLinks: SubmitPrLink[];
	  }
	| {
			kind: "no_current_pr";
			output: SubmitCommandOutput;
			cause: "no_current_pr";
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
			cause: CurrentPrVerificationFailureCause;
	  };

export interface SubmitGateway {
	checkSubmitReadiness(params: SubmitCommandParams): Promise<SubmitPreflightResult>;
	restackCurrentStack(params: SubmitCommandParams): Promise<SubmitRestackResult>;
	submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult>;
	verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult>;
}

export interface SubmitFailureFacts {
	phase: string;
	message: string;
	failurePresentation: SubmitFailurePresentation;
	rawFailureTranscript?: SubmitFailureTranscript;
	publishedPrs: readonly SubmitPrLink[];
	metadataApplied: readonly SubmitPrLink[];
}

export type SubmitResult =
	| {
			type: "reconciled";
			plan: SubmitPlan;
			prs: readonly SubmitPrLink[];
			metadataApplied: readonly SubmitPrLink[];
			metadataPreviews: readonly SubmitPrInventoryPreview[];
	  }
	| ({ type: "refused" } & SubmitFailureFacts)
	| ({ type: "failed" } & SubmitFailureFacts);
