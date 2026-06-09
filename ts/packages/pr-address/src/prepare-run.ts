import { clinkrFailure, clinkrOk, toMachineEnvelope } from "./clinkr-envelope.ts";
import {
	contestedThreadIds,
	fetchFeedbackSnapshot,
	gatewayFailureDetail,
	gatewayFailureMessage,
	gatewayOptions,
	githubGateway,
	parseReadOptions,
} from "./feedback-collection.ts";
import type { GatewayFailure, PRDiscussionComment, PRReview, PRReviewThread, PRSummary, PrAddressGitGateway, PrAddressGitHubGateway, RestructuredFile } from "./gateways.ts";
import { buildPrepareRunPayloadManifest } from "./payload-manifest.ts";
import { PayloadStore, type PayloadReference } from "./payload-store.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

interface PrepareRunInlineFound {
	payload_mode: "inline";
	found: true;
	current_branch: string;
	number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
	state: string;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
	reopened_thread_ids: readonly string[];
	restructured_files: readonly RestructuredFile[];
	warnings: readonly string[];
}

interface PrepareRunInlineNoPr {
	payload_mode: "inline";
	found: false;
	current_branch: string;
	error: string;
	returncode: number;
}

type PrepareRunInlineResult = PrepareRunInlineFound | PrepareRunInlineNoPr;

export async function runPrepareRunOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseReadOptions(invocation.args, ["--payload-mode", "--payload-session-id"], ["--include-all-threads", "--include-empty-reviews"]);
	if (parsed.type === "error") return exitFailure("invalid_request", parsed.message);
	const unexpectedPositional = parsed.options.positionals[0];
	if (unexpectedPositional !== undefined) return exitFailure("invalid_request", `Unexpected argument for prepare-run: ${unexpectedPositional}`);
	const payloadMode = parsed.options.values.get("--payload-mode") ?? "payload";
	if (payloadMode !== "inline" && payloadMode !== "payload") {
		return exitFailure("invalid_request", `--payload-mode must be 'inline' or 'payload', got '${payloadMode}'.`);
	}

	// Python opens the payload store before any gateway work; preserve that ordering.
	let store: PayloadStore | undefined;
	if (payloadMode === "payload") {
		const storeResult = await PayloadStore.fromEnvironment({
			explicitSessionId: parsed.options.values.get("--payload-session-id") ?? null,
			env: invocation.deps.env,
			clock: invocation.deps.context.payloadClock,
		});
		if (storeResult.type === "error") return exitFailure(storeResult.errorType, storeResult.message);
		store = storeResult.value;
	}

	const git = gitGateway(invocation);
	if (git.type === "error") return git.result;
	const branchResult = await git.gateway.getCurrentBranch(gatewayOptions(invocation));
	if (branchResult.type === "failure") return exitFailure("git_failed", gitCommandFailureMessage(branchResult.failure));
	if (branchResult.type === "detached") return exitFailure("detached_head", "Detached HEAD: prepare-run requires a checked-out branch.");
	const currentBranch = branchResult.branch;

	const github = githubGateway(invocation);
	if (github.type === "error") return github.result;
	const lookupResult = await github.gateway.getPrForBranch(currentBranch, gatewayOptions(invocation));
	if (lookupResult.type === "failure") {
		return exitFailure("pr_gateway_failure", gatewayFailureMessage(`Failed to look up PR for current branch '${currentBranch}'`, lookupResult.failure));
	}

	let inlineResult: PrepareRunInlineResult;
	if (lookupResult.type === "miss") {
		inlineResult = { payload_mode: "inline", found: false, current_branch: currentBranch, error: lookupResult.stderr, returncode: lookupResult.returncode };
	} else {
		const prepared = await prepareFoundRun({
			invocation,
			pr: lookupResult.pr,
			currentBranch,
			github: github.gateway,
			git: git.gateway,
			shouldIncludeAllThreads: parsed.options.flags.has("--include-all-threads"),
			shouldIncludeEmptyReviews: parsed.options.flags.has("--include-empty-reviews"),
		});
		if (prepared.type === "error") return prepared.result;
		inlineResult = prepared.value;
	}

	if (store === undefined) return { type: "exit", exit: clinkrOk(inlineResult) };

	const descriptor = inlineResult.found ? `pr-address-prepare-run-pr-${inlineResult.number}` : "pr-address-prepare-run-no-pr";
	const rawReference = await store.writeJsonArtifact({
		descriptor,
		role: "raw",
		payload: toMachineEnvelope(clinkrOk(inlineResult)),
	});
	if (rawReference.type === "error") return exitFailure(rawReference.errorType, rawReference.message);
	return { type: "exit", exit: clinkrOk(buildManifest(inlineResult, rawReference.value)) };
}

async function prepareFoundRun(options: {
	invocation: ExecOperationInvocation;
	pr: PRSummary;
	currentBranch: string;
	github: PrAddressGitHubGateway;
	git: PrAddressGitGateway;
	shouldIncludeAllThreads: boolean;
	shouldIncludeEmptyReviews: boolean;
}): Promise<{ type: "ok"; value: PrepareRunInlineFound } | { type: "error"; result: ExecOperationDispatchResult }> {
	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: options.github,
		prNumber: options.pr.number,
		shouldIncludeResolved: true,
		shouldIncludeEmptyReviews: options.shouldIncludeEmptyReviews,
		shouldCountAllReviewThreads: false,
		invocation: options.invocation,
	});
	if (snapshotResult.type === "error") return snapshotResult;
	const snapshot = snapshotResult.snapshot;

	const warnings: string[] = [];
	const reopenedThreadIds: string[] = [];
	for (const threadId of contestedThreadIds(snapshot.review_threads)) {
		const result = await options.github.unresolveReviewThread(threadId, gatewayOptions(options.invocation));
		if (result.type === "failure") {
			warnings.push(`Failed to reopen contested thread ${threadId}: ${gatewayFailureDetail(result.failure)}`);
			continue;
		}
		reopenedThreadIds.push(threadId);
	}

	const reopened = new Set(reopenedThreadIds);
	const normalizedThreads: PRReviewThread[] = [];
	for (const thread of snapshot.review_threads) {
		const adjustedThread = reopened.has(thread.id) ? { ...thread, is_resolved: false } : thread;
		if (options.shouldIncludeAllThreads || !adjustedThread.is_resolved) normalizedThreads.push(adjustedThread);
	}

	const filesResult = await options.git.getRestructuredFiles(options.pr.base_ref_name, gatewayOptions(options.invocation));
	let restructuredFiles: readonly RestructuredFile[];
	if (filesResult.type === "failure") {
		warnings.push(restructuredFilesFailureMessage(options.pr.base_ref_name, filesResult.failure));
		restructuredFiles = [];
	} else {
		restructuredFiles = filesResult.value;
	}

	return {
		type: "ok",
		value: {
			payload_mode: "inline",
			found: true,
			current_branch: options.currentBranch,
			number: options.pr.number,
			title: options.pr.title,
			url: options.pr.url,
			head_ref_name: options.pr.head_ref_name,
			base_ref_name: options.pr.base_ref_name,
			state: options.pr.state,
			reviews: snapshot.reviews,
			review_threads: normalizedThreads,
			discussion_comments: snapshot.discussion_comments,
			reopened_thread_ids: reopenedThreadIds,
			restructured_files: restructuredFiles,
			warnings,
		},
	};
}

function buildManifest(inlineResult: PrepareRunInlineResult, payloadReference: PayloadReference): unknown {
	if (!inlineResult.found) {
		return buildPrepareRunPayloadManifest({
			payload_reference: payloadReference,
			found: false,
			current_branch: inlineResult.current_branch,
			error: inlineResult.error,
			returncode: inlineResult.returncode,
		});
	}
	return buildPrepareRunPayloadManifest({
		payload_reference: payloadReference,
		found: true,
		current_branch: inlineResult.current_branch,
		number: inlineResult.number,
		title: inlineResult.title,
		url: inlineResult.url,
		head_ref_name: inlineResult.head_ref_name,
		base_ref_name: inlineResult.base_ref_name,
		state: inlineResult.state,
		reviews: inlineResult.reviews,
		review_threads: inlineResult.review_threads,
		discussion_comments: inlineResult.discussion_comments,
		reopened_thread_ids: inlineResult.reopened_thread_ids,
		restructured_files: inlineResult.restructured_files,
		warnings: inlineResult.warnings,
	});
}

/** Mirror the Python git gateway's current-branch failure message: stderr or a fixed fallback. */
function gitCommandFailureMessage(failure: GatewayFailure): string {
	return failure.stderr.trim() || "git failed";
}

/** Mirror the Python git gateway's restructured-files failure message for warning parity. */
function restructuredFilesFailureMessage(baseRefName: string, failure: GatewayFailure): string {
	return `Failed to detect restructured files against origin/${baseRefName}: ${failure.stderr.trim() || "git diff failed"}`;
}

function gitGateway(invocation: ExecOperationInvocation): { type: "ok"; gateway: PrAddressGitGateway } | { type: "error"; result: ExecOperationDispatchResult } {
	const gateway = invocation.deps.context.git;
	if (gateway === undefined) {
		return { type: "error", result: { type: "exit", exit: clinkrFailure("missing_gateway", "This TypeScript pr-address operation requires a git gateway.") } };
	}
	return { type: "ok", gateway };
}

function exitFailure(errorType: string, message: string): ExecOperationDispatchResult {
	return { type: "exit", exit: clinkrFailure(errorType, message) };
}
