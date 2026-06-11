import { z } from "zod";

import { clinkrFailure, clinkrNegative, clinkrOk } from "./clinkr-envelope.ts";
import type { GatewayFailure, GatewayOptions, PRReviewComment, PrAddressGitGateway, PrAddressGitHubGateway } from "./gateways.ts";
import { loadJsonInput } from "./json-input.ts";
import { parseManagedOptions } from "./managed-options.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";
import { gatewayFailureDetail } from "./operation-support.ts";
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

type PositionalParseResult = { type: "ok"; positionals: readonly string[]; values: ReadonlyMap<string, string> } | { type: "error"; message: string };

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

export async function runReplyToReviewOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseMutationPositionals(invocation.args, []);
	if (parsed.type === "error") return failure("invalid_request", parsed.message);
	const prNumber = integerArgument(parsed.positionals[0], "reply-to-review requires an integer PR number argument.");
	if (prNumber.type === "error") return failure("invalid_request", prNumber.message);
	const reviewAuthor = parsed.positionals[1];
	if (reviewAuthor === undefined) return failure("invalid_request", "reply-to-review requires a review_author argument.");
	const summaryMarkdown = trimOptional(parsed.positionals[2]);
	if (summaryMarkdown === null) return failure("invalid_request", "summary_markdown must not be empty");
	const gateway = githubGateway(invocation);
	if (gateway.type === "error") return gateway.result;
	const body = formatReviewReply({ reviewAuthor, summaryMarkdown });
	const result = await gateway.gateway.addPrDiscussionComment(prNumber.value, body, gatewayOptions(invocation));
	if (result.type === "failure") return gatewayFailureExit("Failed to add PR discussion comment", result.failure);
	return { type: "exit", exit: clinkrOk({ body, comment: result.value }) };
}

export async function runReplyToDiscussionOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseMutationPositionals(invocation.args, []);
	if (parsed.type === "error") return failure("invalid_request", parsed.message);
	const prNumber = integerArgument(parsed.positionals[0], "reply-to-discussion requires an integer PR number argument.");
	if (prNumber.type === "error") return failure("invalid_request", prNumber.message);
	const commentId = integerArgument(parsed.positionals[1], "reply-to-discussion requires an integer comment_id argument.");
	if (commentId.type === "error") return failure("invalid_request", commentId.message);
	const commentAuthor = parsed.positionals[2];
	if (commentAuthor === undefined) return failure("invalid_request", "reply-to-discussion requires a comment_author argument.");
	const originalBody = parsed.positionals[3];
	if (originalBody === undefined) return failure("invalid_request", "reply-to-discussion requires an original_body argument.");
	const response = trimOptional(parsed.positionals[4]);
	if (response === null) return failure("invalid_request", "response must not be empty");
	const gateway = githubGateway(invocation);
	if (gateway.type === "error") return gateway.result;
	const body = formatDiscussionReply({ commentAuthor, originalBody, response });
	const comment = await gateway.gateway.addPrDiscussionComment(prNumber.value, body, gatewayOptions(invocation));
	if (comment.type === "failure") return gatewayFailureExit("Failed to add PR discussion comment", comment.failure);
	const reaction = await gateway.gateway.addPrDiscussionCommentReaction(commentId.value, "+1", gatewayOptions(invocation));
	if (reaction.type === "failure") {
		return { type: "exit", exit: clinkrOk({ body, comment: comment.value, reaction_added: false, warning: `Failed to add reaction to comment ${commentId.value}: ${gatewayFailureDetail(reaction.failure)}` }) };
	}
	return { type: "exit", exit: clinkrOk({ body, comment: comment.value, reaction_added: true, reaction: reaction.value }) };
}

export async function runResolveThreadWithReplyOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseMutationPositionals(invocation.args, ["--provenance-json"]);
	if (parsed.type === "error") return failure("invalid_request", parsed.message);
	const requestResult = await normalizeResolutionFromPositionals(invocation, parsed.positionals, parsed.values.get("--provenance-json"));
	if (requestResult.type === "error") return failure(requestResult.errorType, requestResult.message);
	const gateway = githubGateway(invocation);
	if (gateway.type === "error") return gateway.result;
	const result = await applyResolution(gateway.gateway, requestResult.value, gatewayOptions(invocation));
	if (result.type === "failure") return gatewayFailureExit(result.prefix, result.failure);
	return { type: "exit", exit: clinkrOk(result.value) };
}

export async function runResolveThreadBatchOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const options = parseManagedOptions(invocation.args, ["--payload-json", "--payload-file"]);
	if (options.type === "error") return failure("invalid_request", options.message);
	const payloadResult = await loadJsonInput({
		optionValue: options.options.values.get("--payload-json"),
		filePath: options.options.values.get("--payload-file"),
		commandName: "resolve-thread-batch",
		inputDescription: "JSON payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: resolveThreadBatchPayloadSchema,
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);
	const normalized = await normalizeResolveThreadBatchPayload(payloadResult.value, invocation);
	if (normalized.type === "error") return failure(normalized.errorType, normalized.message);
	const gateway = githubGateway(invocation);
	if (gateway.type === "error") return gateway.result;
	const results: ResolveThreadBatchItemResult[] = [];
	for (let index = 0; index < normalized.value.length; index += 1) {
		const item = normalized.value[index];
		if (item === undefined) continue;
		const result = await applyResolution(gateway.gateway, item, gatewayOptions(invocation));
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
	if (batchResult.all_succeeded) return { type: "exit", exit: clinkrOk(batchResult) };
	return { type: "exit", exit: clinkrNegative(batchResult, `resolve-thread-batch failed for ${batchResult.failed} item(s); skipped ${batchResult.skipped} item(s).`) };
}

async function normalizeResolutionFromPositionals(
	invocation: ExecOperationInvocation,
	positionals: readonly string[],
	provenanceJson: string | undefined,
): Promise<{ type: "ok"; value: NormalizedResolutionRequest } | { type: "error"; errorType: string; message: string }> {
	const threadId = positionals[0]?.trim() ?? "";
	if (threadId === "") return invalid("resolve-thread-with-reply requires a non-empty thread_id argument.");
	const modeResult = resolutionModeArgument(positionals[1]);
	if (modeResult.type === "error") return invalid(modeResult.message);
	const provenance = parseProvenanceJson(provenanceJson, "resolve-thread-with-reply");
	if (provenance.type === "error") return provenance;
	return await normalizeResolutionRequest({
		threadId,
		mode: modeResult.value,
		message: positionals[2] ?? null,
		commitSha: positionals[3] ?? null,
		provenanceInput: provenance.value,
		invocation,
		itemLabel: null,
	});
}

async function normalizeResolveThreadBatchPayload(
	payload: ResolveThreadBatchPayload,
	invocation: ExecOperationInvocation,
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
			invocation,
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
	invocation: ExecOperationInvocation;
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
		const provenanceResult = await validateResolutionProvenance(options.provenanceInput, options.invocation);
		if (provenanceResult.type === "error") return provenanceResult;
		provenance = provenanceResult.value;
	}
	return { type: "ok", value: { threadId: options.threadId, mode: options.mode, message, commitSha, provenance } };
}

async function validateResolutionProvenance(
	provenance: ProvenanceInput,
	invocation: ExecOperationInvocation,
): Promise<{ type: "ok"; value: ResolutionProvenance } | { type: "error"; errorType: string; message: string }> {
	const shapeError = provenanceShapeError(provenance);
	if (shapeError !== null) return invalid(shapeError);
	if (provenance.kind === "local_branch") {
		const gateway = gitGateway(invocation);
		if (gateway.type === "error") return { type: "error", errorType: "invalid_request", message: "local_branch planned provenance requires a git gateway for validation" };
		const branch = provenance.branch.trim();
		const result = await gateway.gateway.getBranchHeadOid(branch, gatewayOptions(invocation));
		if (result.type === "found") return { type: "ok", value: { kind: "local_branch", branch, branch_head_oid: result.oid } };
		if (result.type === "missing") return invalid(`planned provenance local branch does not exist or cannot be resolved: ${branch} (${result.stderr})`);
		return { type: "error", errorType: "invalid_request", message: `planned provenance local branch does not exist or cannot be resolved: ${branch} (${gatewayFailureDetail(result.failure)})` };
	}
	const gateway = githubGateway(invocation);
	if (gateway.type === "error") return { type: "error", errorType: "invalid_request", message: "pr planned provenance requires a PR gateway for validation" };
	const result = await gateway.gateway.getPr(provenance.pr_number, gatewayOptions(invocation));
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

function parseMutationPositionals(args: readonly string[], valueOptions: readonly string[]): PositionalParseResult {
	const positionals: string[] = [];
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;
		if (arg === "--format") {
			index += 1;
			continue;
		}
		if (arg === "--json-schema") continue;
		if (arg === "--") continue;
		if (valueOptions.includes(arg)) {
			const value = args[index + 1];
			if (value === undefined) return { type: "error", message: `${arg} requires a value.` };
			values.set(arg, value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--")) return { type: "error", message: `Unknown option for managed pr-address operation: ${arg}` };
		positionals.push(arg);
	}
	return { type: "ok", positionals, values };
}

function parseProvenanceJson(value: string | undefined, commandName: string): { type: "ok"; value: ProvenanceInput | null } | { type: "error"; errorType: string; message: string } {
	if (value === undefined || trimOptional(value) === null) return { type: "ok", value: null };
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch (error) {
		return { type: "error", errorType: "invalid_json", message: `${commandName} received invalid JSON for --provenance-json: ${errorMessage(error)}` };
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

function integerArgument(value: string | undefined, message: string): { type: "ok"; value: number } | { type: "error"; message: string } {
	const numeric = value === undefined ? Number.NaN : Number(value);
	if (!Number.isInteger(numeric)) return { type: "error", message };
	return { type: "ok", value: numeric };
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

function githubGateway(invocation: ExecOperationInvocation): { type: "ok"; gateway: PrAddressGitHubGateway } | { type: "error"; result: ExecOperationDispatchResult } {
	const gateway = invocation.deps.context.github;
	if (gateway === undefined) return { type: "error", result: { type: "exit", exit: clinkrFailure("missing_gateway", "This TypeScript pr-address operation requires a GitHub gateway.") } };
	return { type: "ok", gateway };
}

function gitGateway(invocation: ExecOperationInvocation): { type: "ok"; gateway: PrAddressGitGateway } | { type: "error" } {
	const gateway = invocation.deps.context.git;
	if (gateway === undefined) return { type: "error" };
	return { type: "ok", gateway };
}

function gatewayOptions(invocation: ExecOperationInvocation): GatewayOptions {
	return { cwd: invocation.deps.cwd, env: invocation.deps.env };
}

function gatewayFailureExit(prefix: string, failure: GatewayFailure): ExecOperationDispatchResult {
	return { type: "exit", exit: clinkrFailure("pr_gateway_failure", `${prefix}: ${gatewayFailureDetail(failure)}`) };
}

function failure(errorType: string, message: string): ExecOperationDispatchResult {
	return { type: "exit", exit: clinkrFailure(errorType, message) };
}

function invalid(message: string): { type: "error"; errorType: "invalid_request"; message: string } {
	return { type: "error", errorType: "invalid_request", message };
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
