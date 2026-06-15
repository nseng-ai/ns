import { z } from "zod";

import { failure, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import type { PayloadReference as ManifestPayloadReference, ThreadManifestItem } from "./feedback-manifest-contracts.ts";
import type { PayloadReference as StorePayloadReference } from "./payload-store.ts";
import { readFeedbackDetails } from "./read-feedback-detail.ts";
import { resolvePrManifestSessionInput } from "./session-inputs.ts";
import { compactOperationResult } from "./stdout-mode.ts";

const readThreadBodiesParseSchema = z.object({
	pr_number: z.number().int().positive(),
	thread_id: z.array(z.string()).min(1),
	harness_session_id: z.string().optional(),
});

interface ThreadBodyMapping {
	thread_id: string;
	comment_count: number;
	body_pointers: string[];
	artifact_json_pointers: string[];
}

interface ReadThreadBodiesResult {
	pr_number: number;
	thread_ids: string[];
	payload_path: string;
	selected_payload_reference: StorePayloadReference;
	threads: ThreadBodyMapping[];
	counts: {
		requested_threads: number;
		matched_threads: number;
		selected_comment_bodies: number;
		selected_details: number;
		body_values: number;
		item_values: number;
	};
	resolved_inputs: {
		manifest: StorePayloadReference;
		feedback: ManifestPayloadReference;
	};
}

export const readThreadBodiesOperation = defineExecOperation({
	spec: {
		name: "read-thread-bodies",
		description: "Select review-thread comment bodies by thread ID into a summary payload artifact.",
		schema: readThreadBodiesParseSchema,
		handler: runReadThreadBodiesOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => {
			const result = data as ReadThreadBodiesResult;
			return {
				type: "ok",
				value: compactOperationResult({
					operation: "read-thread-bodies",
					counts: result.counts,
					resolvedInputs: result.resolved_inputs,
					artifacts: { full_output: fullOutput, produced: [{ kind: "selected-feedback-details", reference: result.selected_payload_reference }] },
					details: { pr_number: result.pr_number, payload_path: result.payload_path, threads: result.threads },
				}),
			};
		},
	},
});

async function runReadThreadBodiesOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof readThreadBodiesParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const requested = normalizeThreadIds(request.thread_id);
	if (requested.type === "error") return failure(requested.errorType, requested.message);

	const manifestInput = await resolvePrManifestSessionInput({ ctx, prNumber: request.pr_number, harnessSessionId: request.harness_session_id });
	if (manifestInput.type === "error") return failure(manifestInput.errorType, manifestInput.message);

	const pointerLookup = bodyPointersForThreads(manifestInput.value.manifest.review_threads, requested.value);
	if (pointerLookup.type === "error") return failure(pointerLookup.errorType, pointerLookup.message);

	const detailsResult = await readFeedbackDetails({
		selection: { payload_path: manifestInput.value.manifest.payload_reference.payload_path, json_pointers: pointerLookup.bodyPointers },
		ctx,
		payloadStoreFactory: ctx.context.payloadStoreFactory,
		clock: ctx.context.payloadClock,
	});
	if (detailsResult.type === "error") return failure(detailsResult.errorType, detailsResult.message);

	const threads = attachArtifactPointers(pointerLookup.threads, detailsResult.value.details.map((detail) => detail.artifact_json_pointer));
	const data: ReadThreadBodiesResult = {
		pr_number: request.pr_number,
		thread_ids: requested.value,
		payload_path: manifestInput.value.manifest.payload_reference.payload_path,
		selected_payload_reference: detailsResult.value.selected_payload_reference,
		threads,
		counts: {
			requested_threads: requested.value.length,
			matched_threads: threads.length,
			selected_comment_bodies: pointerLookup.bodyPointers.length,
			selected_details: detailsResult.value.counts.selected,
			body_values: detailsResult.value.counts.body_values,
			item_values: detailsResult.value.counts.item_values,
		},
		resolved_inputs: {
			manifest: manifestInput.value.resolvedInput,
			feedback: manifestInput.value.manifest.payload_reference,
		},
	};
	return ok(data);
}

function normalizeThreadIds(threadIds: readonly string[]): { type: "ok"; value: string[] } | { type: "error"; errorType: "invalid_request"; message: string } {
	const normalized = threadIds.map((threadId) => threadId.trim());
	const emptyIndex = normalized.findIndex((threadId) => threadId === "");
	if (emptyIndex !== -1) return { type: "error", errorType: "invalid_request", message: `--thread-id at position ${emptyIndex + 1} must be non-empty.` };
	const duplicate = firstDuplicate(normalized);
	if (duplicate !== null) return { type: "error", errorType: "invalid_request", message: `Duplicate --thread-id value: ${duplicate}` };
	return { type: "ok", value: normalized };
}

function bodyPointersForThreads(
	manifestThreads: readonly ThreadManifestItem[],
	requestedThreadIds: readonly string[],
): { type: "ok"; threads: ThreadBodyMapping[]; bodyPointers: string[] } | { type: "error"; errorType: "invalid_request" | "payload_lookup_failed"; message: string } {
	const byThreadId = new Map(manifestThreads.map((thread) => [thread.thread_id, thread]));
	const missing = requestedThreadIds.filter((threadId) => !byThreadId.has(threadId));
	if (missing.length > 0) return { type: "error", errorType: "invalid_request", message: `Unknown review thread ID(s): ${missing.join(", ")}` };

	const threads: ThreadBodyMapping[] = [];
	const bodyPointers: string[] = [];
	for (const threadId of requestedThreadIds) {
		const thread = byThreadId.get(threadId);
		if (thread === undefined) throw new Error("Thread existence was checked before lookup.");
		const threadPointers = thread.comments.map((comment) => comment.body_locator.json_pointer);
		if (threadPointers.length === 0) {
			return { type: "error", errorType: "payload_lookup_failed", message: `Review thread ${threadId} has no comment body locators in the latest feedback manifest.` };
		}
		threads.push({ thread_id: threadId, comment_count: thread.comments.length, body_pointers: threadPointers, artifact_json_pointers: [] });
		bodyPointers.push(...threadPointers);
	}
	return { type: "ok", threads, bodyPointers };
}

function attachArtifactPointers(threads: readonly ThreadBodyMapping[], artifactPointers: readonly string[]): ThreadBodyMapping[] {
	let offset = 0;
	return threads.map((thread) => {
		const nextOffset = offset + thread.body_pointers.length;
		const value = { ...thread, artifact_json_pointers: [...artifactPointers.slice(offset, nextOffset)] };
		offset = nextOffset;
		return value;
	});
}

function firstDuplicate(values: readonly string[]): string | null {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) return value;
		seen.add(value);
	}
	return null;
}
