import { z } from "zod";

import { failure, ok, toMachineEnvelope, type ClinkrExit } from "@asdl/clinkr";
import { feedbackCounts, fetchFeedbackSnapshot, type FeedbackSnapshot } from "./core/feedback-snapshot.ts";
import { defineExecOperation, gatewayFailureExit, gatewayOptions, type PrAddressExecContext } from "./exec-operation.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread } from "./gateways.ts";
import { buildGetFeedbackPayloadManifest, type PayloadArtifactStore, type PayloadReference } from "./payload-store.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import { prArtifactDescriptor } from "./session-artifacts.ts";
import { compactOperationResult } from "./stdout-mode.ts";

const getFeedbackParseSchema = z.object({
	pr_number: z.int(),
	include_resolved: z.boolean().default(false),
	include_empty_reviews: z.boolean().default(false),
	payload_mode: z.enum(["inline", "payload"]).default("payload"),
	harness_session_id: z.string().optional(),
});

type GetFeedbackRequest = z.output<typeof getFeedbackParseSchema>;

interface GetFeedbackInlineResult {
	payload_mode: "inline";
	pr_number: number;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
}

export const getFeedbackOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "get-feedback",
		description: "Fetch all PR feedback (reviews, threads, discussion comments) in a single batch.",
		schema: getFeedbackParseSchema,
		positionals: { pr_number: { position: 0 } },
		handler: runGetFeedbackOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: async ({ data, store, fullOutput }) => await compactGetFeedbackResult(data, store, fullOutput),
	},
});

async function runGetFeedbackOperation(ctx: PrAddressExecContext, request: GetFeedbackRequest): Promise<ClinkrExit<unknown>> {
	// Pinned operation order opens the payload store before any gateway fetch.
	let store: PayloadArtifactStore | undefined;
	if (request.payload_mode === "payload") {
		const storeResult = await openPayloadStoreFromContext({ ctx, harnessSessionId: request.harness_session_id });
		if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
		store = storeResult.value;
	}

	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: ctx.context.github,
		gatewayOptions: gatewayOptions(ctx),
		prNumber: request.pr_number,
		shouldIncludeResolved: request.include_resolved,
		shouldIncludeEmptyReviews: request.include_empty_reviews,
		shouldCountAllReviewThreads: false,
	});
	if (snapshotResult.type === "failure") return gatewayFailureExit(snapshotResult.message, snapshotResult.failure);
	const snapshot = snapshotResult.snapshot;
	const inlineResult = {
		payload_mode: "inline",
		pr_number: snapshot.pr_number,
		reviews: snapshot.reviews,
		review_threads: snapshot.review_threads,
		discussion_comments: snapshot.discussion_comments,
	};
	if (request.payload_mode === "inline") return ok(inlineResult);
	if (store === undefined) return ok(inlineResult);

	const rawReference = await store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber: snapshot.pr_number, kind: "feedback" }),
		role: "raw",
		payload: toMachineEnvelope(ok(inlineResult)),
	});
	if (rawReference.type === "error") return failure(rawReference.errorType, rawReference.message);
	const manifest = buildGetFeedbackManifestFromSnapshot(snapshot, rawReference.value);
	return ok(manifest);
}

async function compactGetFeedbackResult(
	data: unknown,
	store: PayloadArtifactStore,
	fullOutput: PayloadReference,
): Promise<{ type: "ok"; value: Record<string, unknown> } | { type: "error"; errorType: string; message: string }> {
	if (isInlineFeedbackResult(data)) {
		const rawReference = await store.writeJsonArtifact({
			descriptor: prArtifactDescriptor({ prNumber: data.pr_number, kind: "feedback" }),
			role: "raw",
			payload: toMachineEnvelope(ok(data)),
		});
		if (rawReference.type === "error") return { type: "error", errorType: rawReference.errorType, message: rawReference.message };
		const manifest = buildGetFeedbackPayloadManifest({
			payload_reference: rawReference.value,
			pr_number: data.pr_number,
			reviews: data.reviews,
			review_threads: data.review_threads,
			discussion_comments: data.discussion_comments,
		});
		const manifestReference = await store.writeJsonArtifact({
			descriptor: prArtifactDescriptor({ prNumber: data.pr_number, kind: "manifest" }),
			role: "summary",
			payload: manifest,
		});
		if (manifestReference.type === "error") return { type: "error", errorType: manifestReference.errorType, message: manifestReference.message };
		return {
			type: "ok",
			value: compactOperationResult({
				operation: "get-feedback",
				counts: feedbackCounts({ ...data, counted_review_threads: data.review_threads }),
				artifacts: { full_output: fullOutput, produced: [{ kind: "manifest", reference: manifestReference.value }] },
				details: { pr_number: data.pr_number, manifest },
			}),
		};
	}
	const manifest = data as ReturnType<typeof buildGetFeedbackPayloadManifest>;
	const manifestReference = await store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber: manifest.pr_number, kind: "manifest" }),
		role: "summary",
		payload: manifest,
	});
	if (manifestReference.type === "error") return { type: "error", errorType: manifestReference.errorType, message: manifestReference.message };
	return {
		type: "ok",
		value: compactOperationResult({
			operation: "get-feedback",
			counts: manifest.counts,
			artifacts: { full_output: fullOutput, produced: [{ kind: "manifest", reference: manifestReference.value }] },
			details: { pr_number: manifest.pr_number, manifest },
		}),
	};
}

function isInlineFeedbackResult(value: unknown): value is GetFeedbackInlineResult {
	return typeof value === "object" && value !== null && "payload_mode" in value && value.payload_mode === "inline";
}

export function buildGetFeedbackManifestFromSnapshot(snapshot: FeedbackSnapshot, payloadReference: PayloadReference): unknown {
	return buildGetFeedbackPayloadManifest({
		payload_reference: payloadReference,
		pr_number: snapshot.pr_number,
		reviews: snapshot.reviews,
		review_threads: snapshot.review_threads,
		discussion_comments: snapshot.discussion_comments,
	});
}

export { contestedThreadIds, fetchFeedbackSnapshot, reviewsForRequest } from "./core/feedback-snapshot.ts";
export type { FeedbackSnapshot, FeedbackSnapshotResult, FetchFeedbackSnapshotOptions } from "./core/feedback-snapshot.ts";
