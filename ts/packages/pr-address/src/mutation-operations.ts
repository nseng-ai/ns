import { z } from "zod";

import { failure, negative, ok, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";
import { formatErrorMessage } from "@asdl/core";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import type { GatewayFailure, GatewayOptions, PRReviewComment, PrAddressGitGateway, PrAddressGitHubGateway } from "./gateways.ts";
import { loadJsonInput } from "./json-input.ts";
import { gatewayFailureDetail, gatewayFailureExit, gatewayOptions, githubGateway } from "./operation-support.ts";
import { formatDiscussionReply, formatResolutionReply, formatReviewReply, type ResolutionProvenance, type ResolutionReplyMode, VALID_RESOLUTION_MODES } from "./reply-formatting.ts";

const provenanceInputSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("local_branch"), branch: z.string() }).strict(),
	z.object({ kind: z.literal("pr"), pr_number: z.number().int() }).strict(),
]);

const resolveThreadBatchItemSchema = z.object({
	thread_id: z.string(),
	mode: z.enum(VALID_RESOLUTION_MODES),
	message: z.string().nullable().default(null),
	commit_sha: z.string().nullable().default(null),
	provenance: provenanceInputSchema.nullable().default(null),
});

const resolveThreadBatchPayloadSchema = z.object({
	commit_sha: z.string().nullable().default(null),
	continue_on_error: z.boolean().default(false),
	items: z.array(resolveThreadBatchItemSchema),
});

type ProvenanceInput = z.infer<typeof provenanceInputSchema>;
type ResolveThreadBatchPayload = z.infer<typeof resolveThreadBatchPayloadSchema>;

const replyToReviewParseSchema = z.object({
	pr_number: z.int(),
	review_author: z.string(),
	summary_markdown: z.string(),
});

const replyToDiscussionParseSchema = z.object({
	pr_number: z.int(),
	comment_id: z.int(),
	comment_author: z.string(),
	original_body: z.string(),
	response: z.string(),
});

const resolveThreadWithReplyParseSchema = z.object({
	thread_id: z.string(),
	mode: z.string(),
	message: z.string().optional(),
	commit_sha: z.string().optional(),
	provenance_json: z.string().optional(),
});

const resolveThreadBatchParseSchema = z.object({
	payload_json: z.string().optional(),
	payload_file: z.string().optional(),
});

interface NormalizedResolutionRequest {
	threadId: string;
	mode: ResolutionReplyMode;
	message: string | null;
	commitSha: string | null;
	provenance: ResolutionProvenance | null;
}

interface ResolveThreadBatchItemResult {
	index: number;
	thread_id: string;
	mode: ResolutionReplyMode;
	status: "resolved" | "failed" | "skipped";
	body?: string | undefined;
	comment?: PRReviewComment | undefined;
	is_resolved?: boolean | undefined;
	error_type?: string | undefined;
	error_message?: string | undefined;
	provenance?: ResolutionProvenance | null | undefined;
}

export const replyToReviewOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "reply-to-review",
		description: "Post a formatted reply to a PR-level review.",
		schema: replyToReviewParseSchema,
		positionals: { pr_number: { position: 0 }, review_author: { position: 1 }, summary_markdown: { position: 2 } },
		handler: runReplyToReviewOperation,
	},
});

export const replyToDiscussionOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "reply-to-discussion",
		description: "Reply to a PR discussion comment and add a +1 reaction when possible.",
		schema: replyToDiscussionParseSchema,
		positionals: { pr_number: { position: 0 }, comment_id: { position: 1 }, comment_author: { position: 2 }, original_body: { position: 3 }, response: { position: 4 } },
		handler: runReplyToDiscussionOperation,
	},
});

export const resolveThreadWithReplyOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "resolve-thread-with-reply",
		description: "Reply to and resolve a PR review thread with canonical pr-address formatting.",
		schema: resolveThreadWithReplyParseSchema,
		positionals: { thread_id: { position: 0 }, mode: { position: 1 }, message: { position: 2 }, commit_sha: { position: 3 } },
		handler: runResolveThreadWithReplyOperation,
	},
});

export const resolveThreadBatchOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "resolve-thread-batch",
		description: "Reply to and resolve multiple PR review threads from a JSON payload.",
		schema: resolveThreadBatchParseSchema,
		handler: runResolveThreadBatchOperation,
	},
});

async function runReplyToReviewOperation(ctx: PrAddressExecContext, request: z.output<typeof replyToReviewParseSchema>): Promise<ClinkrExit<unknown>> {
	const summaryMarkdown = trimOptional(request.summary_markdown);
	if (summaryMarkdown === null) return failure("invalid_request", "summary_markdown must not be empty");
	const gateway = githubGateway(ctx);
	if (gateway.type === "error") return gateway.exit;
	const body = formatReviewReply({ reviewAuthor: request.review_author, summaryMarkdown });
	const result = await gateway.gateway.addPrDiscussionComment(request.pr_number, body, gatewayOptions(ctx));
	if (result.type === "failure") return gatewayFailureExit("Failed to add PR discussion comment", result.failure);
	return ok({ body, comment: result.value });
}

async function runReplyToDiscussionOperation(ctx: PrAddressExecContext, request: z.output<typeof replyToDiscussionParseSchema>): Promise<ClinkrExit<unknown>> {
	const response = trimOptional(request.response);
	if (response === null) return failure("invalid_request", "response must not be empty");
	const gateway = githubGateway(ctx);
	if (gateway.type === "error") return gateway.exit;
	const body = formatDiscussionReply({ commentAuthor: request.comment_author, originalBody: request.original_body, response });
	const comment = await gateway.gateway.addPrDiscussionComment(request.pr_number, body, gatewayOptions(ctx));
	if (comment.type === "failure") return gatewayFailureExit("Failed to add PR discussion comment", comment.failure);
	const reaction = await gateway.gateway.addPrDiscussionCommentReaction(request.comment_id, "+1", gatewayOptions(ctx));
	if (reaction.type === "failure") {
		return ok({ body, comment: comment.value, reaction_added: false, warning: `Failed to add reaction to comment ${request.comment_id}: ${gatewayFailureDetail(reaction.failure)}` });
	}
	return ok({ body, comment: comment.value, reaction_added: true, reaction: reaction.value });
}

async function runResolveThreadWithReplyOperation(ctx: PrAddressExecContext, request: z.output<typeof resolveThreadWithReplyParseSchema>): Promise<ClinkrExit<unknown>> {
	const requestResult = await normalizeResolutionFromRequest(ctx, request);
	if (requestResult.type === "error") return failure(requestResult.errorType, requestResult.message);
	const gateway = githubGateway(ctx);
	if (gateway.type === "error") return gateway.exit;
	const result = await applyResolution(gateway.gateway, requestResult.value, gatewayOptions(ctx));
	if (result.type === "failure") return gatewayFailureExit(result.prefix, result.failure);
	return ok(result.value);
}

async function runResolveThreadBatchOperation(ctx: PrAddressExecContext, request: z.output<typeof resolveThreadBatchParseSchema>): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.payload_json,
		filePath: request.payload_file,
		commandName: "resolve-thread-batch",
		inputDescription: "JSON payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: resolveThreadBatchPayloadSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);
	const normalized = await normalizeResolveThreadBatchPayload(payloadResult.value, ctx);
	if (normalized.type === "error") return failure(normalized.errorType, normalized.message);
	const gateway = githubGateway(ctx);
	if (gateway.type === "error") return gateway.exit;
	const results: ResolveThreadBatchItemResult[] = [];
	for (let index = 0; index < normalized.value.length; index += 1) {
		const item = normalized.value[index];
		if (item === undefined) continue;
		const result = await applyResolution(gateway.gateway, item, gatewayOptions(ctx));
		if (result.type === "failure") {
			results.push({ index, thread_id: item.threadId, mode: item.mode, status: "failed", error_type: "gateway_error", error_message: gatewayFailureDetail(result.failure) });
			if (!payloadResult.value.continue_on_error) {
				results.push(...skippedResults(normalized.value.slice(index + 1), index + 1));
				break;
			}
			continue;
		}
		results.push({ index, thread_id: result.value.thread_id, mode: item.mode, status: "resolved", body: result.value.body, comment: result.value.comment, is_resolved: result.value.is_resolved, provenance: result.value.provenance });
	}
	const batchResult = batchResultFrom(results, normalized.value.length);
	if (batchResult.all_succeeded) return ok(batchResult);
	return negative(`resolve-thread-batch failed for ${batchResult.failed} item(s); skipped ${batchResult.skipped} item(s).`, batchResult);
}

async function normalizeResolutionFromRequest(
	ctx: PrAddressExecContext,
	request: z.output<typeof resolveThreadWithReplyParseSchema>,
): Promise<{ type: "ok"; value: NormalizedResolutionRequest } | { type: "error"; errorType: string; message: string }> {
	const threadId = request.thread_id.trim();
	if (threadId === "") return invalid("resolve-thread-with-reply requires a non-empty thread_id argument.");
	const modeResult = resolutionModeArgument(request.mode);
	if (modeResult.type === "error") return invalid(modeResult.message);
	const provenance = parseProvenanceJson(request.provenance_json, "resolve-thread-with-reply");
	if (provenance.type === "error") return provenance;
	return await normalizeResolutionRequest({
		threadId,
		mode: modeResult.value,
		message: request.message ?? null,
		commitSha: request.commit_sha ?? null,
		provenanceInput: provenance.value,
		ctx,
		itemLabel: null,
	});
}

async function normalizeResolveThreadBatchPayload(
	payload: ResolveThreadBatchPayload,
	ctx: PrAddressExecContext,
): Promise<{ type: "ok"; value: readonly NormalizedResolutionRequest[] } | { type: "error"; errorType: string; message: string }> {
	if (payload.items.length === 0) return invalid("resolve-thread-batch payload must include at least one item");
	const seen = new Set<string>();
	const batchCommitSha = trimOptional(payload.commit_sha);
	const normalized: NormalizedResolutionRequest[] = [];
	for (let index = 0; index < payload.items.length; index += 1) {
		const item = payload.items[index];
		if (item === undefined) continue;
		const threadId = item.thread_id.trim();
		if (threadId === "") return invalid(`items[${index}].thread_id must be non-empty`);
		if (seen.has(threadId)) return invalid(`Duplicate thread_id in resolve-thread-batch payload: ${threadId}`);
		seen.add(threadId);
		const itemCommitSha = trimOptional(item.commit_sha);
		let effectiveCommitSha = itemCommitSha;
		if (item.mode === "fixed" && effectiveCommitSha === null) effectiveCommitSha = batchCommitSha;
		if (item.mode === "planned" && itemCommitSha !== null) return invalid(`items[${index}] mode='planned' must not include item commit_sha`);
		const normalizedItem = await normalizeResolutionRequest({
			threadId,
			mode: item.mode,
			message: item.message,
			commitSha: effectiveCommitSha,
			provenanceInput: item.provenance,
			ctx,
			itemLabel: `items[${index}]`,
		});
		if (normalizedItem.type === "error") return normalizedItem;
		normalized.push(normalizedItem.value);
	}
	return { type: "ok", value: normalized };
}

async function normalizeResolutionRequest(options: {
	threadId: string;
	mode: ResolutionReplyMode;
	message: string | null;
	commitSha: string | null;
	provenanceInput: ProvenanceInput | null;
	ctx: PrAddressExecContext;
	itemLabel: string | null;
}): Promise<{ type: "ok"; value: NormalizedResolutionRequest } | { type: "error"; errorType: string; message: string }> {
	const message = trimOptional(options.message);
	const commitSha = trimOptional(options.commitSha);
	const provenanceWasSupplied = options.provenanceInput !== null;
	if (options.mode !== "planned" && provenanceWasSupplied) return invalid(`mode='${options.mode}' must not include provenance; provenance is only valid with mode='planned'`);
	let provenance: ResolutionProvenance | null = null;
	if (options.mode === "fixed") {
		if (message === null) return invalid("mode='fixed' requires a non-empty message");
		if (commitSha === null) return invalid("mode='fixed' requires a non-empty commit_sha");
	} else if (options.mode === "explained") {
		if (message === null) return invalid("mode='explained' requires a non-empty message");
	} else if (options.mode === "planned") {
		if (message === null) return invalid("mode='planned' requires a non-empty message");
		if (commitSha !== null) return invalid(options.itemLabel === null ? "mode='planned' must not include commit_sha" : `${options.itemLabel} mode='planned' must not include item commit_sha`);
		if (options.provenanceInput === null) return invalid("mode='planned' requires provenance");
		const provenanceResult = await validateResolutionProvenance(options.provenanceInput, options.ctx);
		if (provenanceResult.type === "error") return provenanceResult;
		provenance = provenanceResult.value;
	}
	return { type: "ok", value: { threadId: options.threadId, mode: options.mode, message, commitSha, provenance } };
}

async function validateResolutionProvenance(
	provenance: ProvenanceInput,
	ctx: PrAddressExecContext,
): Promise<{ type: "ok"; value: ResolutionProvenance } | { type: "error"; errorType: string; message: string }> {
	const shapeError = provenanceShapeError(provenance);
	if (shapeError !== null) return invalid(shapeError);
	if (provenance.kind === "local_branch") {
		const gateway = gitGateway(ctx);
		if (gateway.type === "error") return { type: "error", errorType: "invalid_request", message: "local_branch planned provenance requires a git gateway for validation" };
		const branch = provenance.branch.trim();
		const result = await gateway.gateway.getBranchHeadOid(branch, gatewayOptions(ctx));
		if (result.type === "found") return { type: "ok", value: { kind: "local_branch", branch, branch_head_oid: result.oid } };
		if (result.type === "missing") return invalid(`planned provenance local branch does not exist or cannot be resolved: ${branch} (${result.stderr})`);
		return { type: "error", errorType: "invalid_request", message: `planned provenance local branch does not exist or cannot be resolved: ${branch} (${gatewayFailureDetail(result.failure)})` };
	}
	const gateway = githubGateway(ctx);
	if (gateway.type === "error") return { type: "error", errorType: "invalid_request", message: "pr planned provenance requires a PR gateway for validation" };
	const result = await gateway.gateway.getPr(provenance.pr_number, gatewayOptions(ctx));
	if (result.type === "miss") return invalid(`planned provenance PR does not exist: #${provenance.pr_number}`);
	if (result.type === "failure") return { type: "error", errorType: "pr_gateway_failure", message: `Failed to validate planned provenance PR #${provenance.pr_number}: ${gatewayFailureDetail(result.failure)}` };
	return {
		type: "ok",
		value: {
			kind: "pr",
			pr_number: result.pr.number,
			pr_url: result.pr.url,
			pr_state: result.pr.state,
			pr_head_ref_name: result.pr.head_ref_name,
			pr_head_ref_oid: result.pr.head_ref_oid ?? null,
		},
	};
}

async function applyResolution(
	gateway: PrAddressGitHubGateway,
	request: NormalizedResolutionRequest,
	options: GatewayOptions,
): Promise<{ type: "ok"; value: { thread_id: string; body: string; comment: PRReviewComment; is_resolved: boolean; provenance: ResolutionProvenance | null } } | { type: "failure"; prefix: string; failure: GatewayFailure }> {
	const body = formatResolutionReply({ mode: request.mode, message: request.message, commitSha: request.commitSha, provenance: request.provenance });
	const comment = await gateway.addReviewThreadReply(request.threadId, body, options);
	if (comment.type === "failure") return { type: "failure", prefix: "Failed to add review thread reply", failure: comment.failure };
	const resolved = await gateway.resolveReviewThread(request.threadId, options);
	if (resolved.type === "failure") return { type: "failure", prefix: "Failed to resolve review thread", failure: resolved.failure };
	return { type: "ok", value: { thread_id: resolved.value.thread_id, body, comment: comment.value, is_resolved: resolved.value.is_resolved, provenance: request.provenance } };
}

function skippedResults(items: readonly NormalizedResolutionRequest[], start: number): ResolveThreadBatchItemResult[] {
	return items.map((item, offset) => ({
		index: start + offset,
		thread_id: item.threadId,
		mode: item.mode,
		status: "skipped",
		error_type: "skipped_after_failure",
		error_message: "Skipped because an earlier item failed and continue_on_error is false.",
	}));
}

function batchResultFrom(results: readonly ResolveThreadBatchItemResult[], total: number) {
	const resolved = results.filter((result) => result.status === "resolved").length;
	const failed = results.filter((result) => result.status === "failed").length;
	const skipped = results.filter((result) => result.status === "skipped").length;
	return { total, resolved, failed, skipped, all_succeeded: failed === 0 && skipped === 0 && resolved === total, results };
}

function parseProvenanceJson(value: string | undefined, commandName: string): { type: "ok"; value: ProvenanceInput | null } | { type: "error"; errorType: string; message: string } {
	if (value === undefined || trimOptional(value) === null) return { type: "ok", value: null };
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch (error) {
		return { type: "error", errorType: "invalid_json", message: `${commandName} received invalid JSON for --provenance-json: ${formatErrorMessage(error)}` };
	}
	const result = provenanceInputSchema.safeParse(parsed);
	if (!result.success) return { type: "error", errorType: "invalid_request", message: z.prettifyError(result.error) };
	return { type: "ok", value: result.data };
}

function provenanceShapeError(provenance: ProvenanceInput): string | null {
	if (provenance.kind === "local_branch") return trimOptional(provenance.branch) === null ? "kind='local_branch' provenance requires a non-empty branch" : null;
	if (provenance.pr_number <= 0) return "kind='pr' provenance requires a positive pr_number";
	return null;
}

function resolutionModeArgument(value: string | undefined): { type: "ok"; value: ResolutionReplyMode } | { type: "error"; message: string } {
	if (value === "fixed" || value === "pre_existing" || value === "explained" || value === "planned") return { type: "ok", value };
	return { type: "error", message: `resolve-thread-with-reply requires a mode argument using one of: ${VALID_RESOLUTION_MODES.join(", ")}.` };
}

function trimOptional(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function gitGateway(ctx: PrAddressExecContext): { type: "ok"; gateway: PrAddressGitGateway } | { type: "error" } {
	const gateway = ctx.context.git;
	if (gateway === undefined) return { type: "error" };
	return { type: "ok", gateway };
}

function invalid(message: string): { type: "error"; errorType: "invalid_request"; message: string } {
	return { type: "error", errorType: "invalid_request", message };
}
