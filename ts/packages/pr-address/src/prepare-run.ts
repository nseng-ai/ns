import { z } from "zod";

import { failure, ok, toMachineEnvelope, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";
import { defineExecOperation, gatewayFailureDetail, gatewayFailureMessage, gatewayOptions, type PrAddressExecContext } from "./exec-operation.ts";
import { contestedThreadIds, fetchFeedbackSnapshot } from "./feedback-collection.ts";
import type { GatewayFailure, PRDiscussionComment, PRReview, PRReviewThread, PRSummary, PrAddressGitGateway, PrAddressGitHubGateway, RestructuredFile } from "./gateways.ts";
import { buildPrepareRunPayloadManifest, type PayloadArtifactStore, type PayloadReference, type PrepareRunPayloadManifest } from "./payload-store.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import { prArtifactDescriptor } from "./session-artifacts.ts";
import { compactOperationResult } from "./stdout-mode.ts";

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

const prepareRunParseSchema = z.object({
	payload_mode: z.enum(["inline", "payload"]).default("payload"),
	harness_session_id: z.string().optional(),
	include_all_threads: z.boolean().default(false),
	include_empty_reviews: z.boolean().default(false),
});

type PrepareRunRequest = z.output<typeof prepareRunParseSchema>;

export const prepareRunOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "prepare-run",
		description: "Resolve PR context, reopen contested threads, and normalize feedback.",
		schema: prepareRunParseSchema,
		handler: runPrepareRunOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: async ({ data, store, fullOutput }) => {
			const manifest = isPrepareRunInlineResult(data) ? buildManifest(data, fullOutput) : (data as PrepareRunPayloadManifest);
			const manifestReference =
				manifest.found && manifest.number !== null ? await writePrManifestArtifact({ store, prNumber: manifest.number, manifest }) : null;
			if (manifestReference?.type === "error") return { type: "error", errorType: manifestReference.errorType, message: manifestReference.message };
			return {
				type: "ok",
				value: compactOperationResult({
					operation: "prepare-run",
					counts: prepareRunCompactCounts(manifest),
					warnings: Array.isArray(manifest.warnings) ? manifest.warnings : [],
					artifacts: {
						full_output: fullOutput,
						produced: manifestReference === null ? [] : [{ kind: "manifest", reference: manifestReference.value }],
					},
					details: { manifest },
				}),
			};
		},
	},
});

async function runPrepareRunOperation(ctx: PrAddressExecContext, request: PrepareRunRequest): Promise<ClinkrExit<unknown>> {
	// Python opens the payload store before any gateway work; preserve that ordering.
	let store: PayloadArtifactStore | undefined;
	if (request.payload_mode === "payload") {
		const storeResult = await openPayloadStoreFromContext({ ctx, harnessSessionId: request.harness_session_id });
		if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
		store = storeResult.value;
	}

	const git = ctx.context.git;
	const branchResult = await git.getCurrentBranch(gatewayOptions(ctx));
	if (branchResult.type === "failure") return failure("git_failed", gitCommandFailureMessage(branchResult.failure));
	if (branchResult.type === "detached") return failure("detached_head", "Detached HEAD: prepare-run requires a checked-out branch.");
	const currentBranch = branchResult.branch;

	const github = ctx.context.github;
	const lookupResult = await github.getPrForBranch(currentBranch, gatewayOptions(ctx));
	if (lookupResult.type === "failure") {
		return failure("pr_gateway_failure", gatewayFailureMessage(`Failed to look up PR for current branch '${currentBranch}'`, lookupResult.failure));
	}

	let inlineResult: PrepareRunInlineResult;
	if (lookupResult.type === "miss") {
		inlineResult = { payload_mode: "inline", found: false, current_branch: currentBranch, error: lookupResult.stderr, returncode: lookupResult.returncode };
	} else {
		const prepared = await prepareFoundRun({
			ctx,
			pr: lookupResult.pr,
			currentBranch,
			github,
			git,
			shouldIncludeAllThreads: request.include_all_threads,
			shouldIncludeEmptyReviews: request.include_empty_reviews,
		});
		if (prepared.type === "error") return prepared.exit;
		inlineResult = prepared.value;
	}

	if (request.payload_mode === "inline") return ok(inlineResult);
	if (store === undefined) return ok(inlineResult);

	const descriptor = inlineResult.found ? `pr-address-prepare-run-pr-${inlineResult.number}` : "pr-address-prepare-run-no-pr";
	const rawReference = await store.writeJsonArtifact({
		descriptor,
		role: "raw",
		payload: toMachineEnvelope(ok(inlineResult)),
	});
	if (rawReference.type === "error") return failure(rawReference.errorType, rawReference.message);
	const manifest = buildManifest(inlineResult, rawReference.value);
	return ok(manifest);
}

async function prepareFoundRun(options: {
	ctx: PrAddressExecContext;
	pr: PRSummary;
	currentBranch: string;
	github: PrAddressGitHubGateway;
	git: PrAddressGitGateway;
	shouldIncludeAllThreads: boolean;
	shouldIncludeEmptyReviews: boolean;
}): Promise<{ type: "ok"; value: PrepareRunInlineFound } | { type: "error"; exit: ClinkrFailureExit }> {
	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: options.github,
		prNumber: options.pr.number,
		shouldIncludeResolved: true,
		shouldIncludeEmptyReviews: options.shouldIncludeEmptyReviews,
		shouldCountAllReviewThreads: false,
		ctx: options.ctx,
	});
	if (snapshotResult.type === "error") return snapshotResult;
	const snapshot = snapshotResult.snapshot;

	const warnings: string[] = [];
	const reopenedThreadIds: string[] = [];
	for (const threadId of contestedThreadIds(snapshot.review_threads)) {
		const result = await options.github.unresolveReviewThread(threadId, gatewayOptions(options.ctx));
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

	const filesResult = await options.git.getRestructuredFiles(options.pr.base_ref_name, gatewayOptions(options.ctx));
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

async function writePrManifestArtifact(options: {
	store: PayloadArtifactStore;
	prNumber: number;
	manifest: unknown;
}): Promise<{ type: "ok"; value: PayloadReference } | { type: "error"; errorType: string; message: string }> {
	return await options.store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber: options.prNumber, kind: "manifest" }),
		role: "summary",
		payload: options.manifest,
	});
}

function prepareRunCompactCounts(manifest: ReturnType<typeof buildPrepareRunPayloadManifest>): Record<string, unknown> {
	if (!manifest.found) return { found: 0 };
	return {
		reviews: manifest.reviews.length,
		review_threads: manifest.review_threads.length,
		discussion_comments: manifest.discussion_comments.length,
		reopened_threads: manifest.reopened_thread_ids.length,
		restructured_files: manifest.restructured_files.length,
	};
}

function isPrepareRunInlineResult(value: unknown): value is PrepareRunInlineResult {
	return typeof value === "object" && value !== null && "payload_mode" in value && value.payload_mode === "inline";
}

function buildManifest(inlineResult: PrepareRunInlineResult, payloadReference: PayloadReference): ReturnType<typeof buildPrepareRunPayloadManifest> {
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
