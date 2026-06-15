import { z } from "zod";

import type { PrAddressExecContext } from "./exec-operation.ts";
import { getFeedbackManifestSchema, type GetFeedbackManifest } from "./feedback-manifest-contracts.ts";
import type { FeedbackPlanBatch } from "./feedback-plan-contracts.ts";
import type { JsonInputError } from "./json-input.ts";
import { buildGetFeedbackPayloadManifest, type JsonPayloadRole, type PayloadArtifactStore, type PayloadErrorType, type PayloadReference } from "./payload-store.ts";
import {
	classificationArtifactSchema,
	prArtifactDescriptor,
	prBatchArtifactDescriptor,
	resolveLatestJsonSessionArtifact,
	stackArtifactDescriptor,
	type ClassificationArtifact,
	type PrArtifactKind,
	type ResolvedSessionArtifact,
	type StackArtifactKind,
} from "./session-artifacts.ts";
import { feedbackPlanConsumerSchema, type FeedbackPlanConsumer } from "./feedback-plan-contracts.ts";
import { threadResolutionBuildArtifactSchema, threadResolutionResultArtifactSchema, type ThreadResolutionBuildArtifact, type ThreadResolutionResultArtifact } from "./thread-resolution-build-artifact.ts";
import {
	stackFeedbackPlanConsumerResultSchema,
	type StackFeedbackPlanConsumerResult,
	type StackFeedbackPlanInput,
	type StackFeedbackPlanResolvedInputs,
} from "./stack-feedback-plan-contracts.ts";
import {
	stackFeedbackPrepResultInputSchema,
	stackFeedbackPrepResultWithManifestSchema,
	type StackFeedbackPrepResultWithManifest,
} from "./stack-feedback-prep-contracts.ts";

export interface OperationInputError<TErrorType extends string = JsonInputError["errorType"]> {
	errorType: TErrorType;
	message: string;
}

export type OperationResult<T, TErrorType extends string = JsonInputError["errorType"]> =
	| { type: "ok"; value: T }
	| ({ type: "error" } & OperationInputError<TErrorType>);

export type OperationInputSourceKind = "explicit" | "stdin" | "session";

export interface ResolvedSourceInput<T> {
	source: OperationInputSourceKind;
	value: T;
}

export type StdinInputPolicy<T> =
	| { type: "payload"; read: () => Promise<string> }
	| { type: "inline_json"; read: () => Promise<string>; resolveInlineJson: (stdinText: string) => OperationResult<T, string> | Promise<OperationResult<T, string>> };

export async function resolveExplicitOrSelectedSessionInput<T>(options: {
	commandName: string;
	explicitSource: { hasExplicitSource: boolean; description: string; resolve: (stdin: () => Promise<string>) => Promise<OperationResult<T, string>> };
	sessionSource: { isSelected: boolean; description: string; resolve: () => Promise<OperationResult<T, string>> };
	stdin?: { read: () => Promise<string> } | undefined;
	defaultSource: "explicit" | "error";
	mixInputMessage?: string | undefined;
	missingInputMessage?: string | undefined;
}): Promise<OperationResult<ResolvedSourceInput<T>, string>> {
	if (options.explicitSource.hasExplicitSource && options.sessionSource.isSelected) {
		return { type: "error", errorType: "invalid_request", message: options.mixInputMessage ?? defaultMixInputMessage(options) };
	}
	if (options.explicitSource.hasExplicitSource) return await resolveExplicitSource(options.explicitSource, options.stdin?.read ?? emptyStdin);
	if (options.sessionSource.isSelected) return await resolveSessionSource(options.sessionSource);
	if (options.stdin !== undefined) {
		const stdinText = await options.stdin.read();
		if (stdinText.trim() !== "") return await resolveExplicitSource(options.explicitSource, async () => stdinText, "stdin");
		if (options.defaultSource === "explicit") return await resolveExplicitSource(options.explicitSource, async () => stdinText);
	}
	if (options.defaultSource === "explicit") return await resolveExplicitSource(options.explicitSource, emptyStdin);
	return { type: "error", errorType: "invalid_request", message: options.missingInputMessage ?? defaultMissingInputMessage(options) };
}

export async function resolveExplicitStdinOrDefaultSessionInput<T>(options: {
	explicitSource: { hasExplicitSource: boolean; resolve: (stdin: () => Promise<string>) => Promise<OperationResult<T, string>> };
	stdin: StdinInputPolicy<T>;
	defaultSessionSource: { resolve: () => Promise<OperationResult<T, string>> };
}): Promise<OperationResult<ResolvedSourceInput<T>, string>> {
	if (options.explicitSource.hasExplicitSource) return await resolveExplicitSource(options.explicitSource, options.stdin.read);
	const stdinText = await options.stdin.read();
	if (stdinText.trim() !== "") {
		if (options.stdin.type === "payload") return await resolveExplicitSource(options.explicitSource, async () => stdinText, "stdin");
		const result = await options.stdin.resolveInlineJson(stdinText);
		if (result.type === "error") return result;
		return { type: "ok", value: { source: "stdin", value: result.value } };
	}
	return await resolveSessionSource(options.defaultSessionSource);
}

async function resolveExplicitSource<T>(
	explicitSource: { resolve: (stdin: () => Promise<string>) => Promise<OperationResult<T, string>> },
	stdin: () => Promise<string>,
	source: "explicit" | "stdin" = "explicit",
): Promise<OperationResult<ResolvedSourceInput<T>, string>> {
	const result = await explicitSource.resolve(stdin);
	if (result.type === "error") return result;
	return { type: "ok", value: { source, value: result.value } };
}

async function resolveSessionSource<T>(sessionSource: { resolve: () => Promise<OperationResult<T, string>> }): Promise<OperationResult<ResolvedSourceInput<T>, string>> {
	const result = await sessionSource.resolve();
	if (result.type === "error") return result;
	return { type: "ok", value: { source: "session", value: result.value } };
}

function defaultMixInputMessage<T>(options: {
	commandName: string;
	explicitSource: { description: string };
	sessionSource: { description: string };
}): string {
	return `${options.commandName} cannot mix ${options.explicitSource.description} with ${options.sessionSource.description}; pass exactly one input source.`;
}

function defaultMissingInputMessage<T>(options: {
	commandName: string;
	explicitSource: { description: string };
	sessionSource?: { description: string } | undefined;
}): string {
	const sessionDescription = options.sessionSource?.description;
	const sources = sessionDescription === undefined ? options.explicitSource.description : `${options.explicitSource.description} or ${sessionDescription}`;
	return `${options.commandName} requires an input source via ${sources}.`;
}

async function emptyStdin(): Promise<string> {
	return "";
}

export interface OpenPayloadStoreFromContextOptions {
	ctx: PrAddressExecContext;
	harnessSessionId?: string | undefined;
}

export type PrFeedbackSourceResolution =
	| { kind: "raw_path"; payloadPath: string }
	| { kind: "session"; payloadPath: string; store: PayloadArtifactStore; resolvedInput: PayloadReference };

export type PrFeedbackSessionSourceResolution = Extract<PrFeedbackSourceResolution, { kind: "session" }>;

export interface PrManifestSessionInput {
	store: PayloadArtifactStore;
	manifest: GetFeedbackManifest;
	resolvedInput: PayloadReference;
}

export interface PlanFeedbackSessionInputs {
	store: PayloadArtifactStore;
	manifest: GetFeedbackManifest;
	classification: ClassificationArtifact;
	resolvedInputs: {
		manifest: PayloadReference;
		classification: PayloadReference;
	};
}

export interface StackFeedbackPlanSessionInputResult {
	payload: StackFeedbackPlanInput;
	resolvedInputs: StackFeedbackPlanResolvedInputs;
}

export interface StackFeedbackDiffCurrentResolvedInputs {
	stack_plan: PayloadReference;
	current_prep: PayloadReference;
}

export interface StackFeedbackDiffCurrentSessionInputResult {
	payload: { stack_plan: StackFeedbackPlanConsumerResult; current_prep: StackFeedbackPrepResultWithManifest };
	resolvedInputs: StackFeedbackDiffCurrentResolvedInputs;
}

export interface ResolveThreadBuildPlanSessionInput {
	store: PayloadArtifactStore;
	plan: FeedbackPlanConsumer;
	resolvedInput: PayloadReference;
}

export interface StackResolveThreadBuildPlanSessionInput {
	store: PayloadArtifactStore;
	plan: StackFeedbackPlanConsumerResult;
	resolvedInput: PayloadReference;
}

export async function openPayloadStoreFromContext(options: OpenPayloadStoreFromContextOptions): Promise<OperationResult<PayloadArtifactStore, PayloadErrorType>> {
	const storeResult = await options.ctx.context.payloadStoreFactory.fromEnvironment({
		explicitHarnessSessionId: options.harnessSessionId ?? null,
		env: options.ctx.env,
		clock: options.ctx.context.payloadClock,
	});
	if (storeResult.type === "error") return { type: "error", errorType: storeResult.errorType, message: storeResult.message };
	return { type: "ok", value: storeResult.value };
}

export async function resolveLatestPrSessionArtifact<T>(options: {
	store: PayloadArtifactStore;
	prNumber: number;
	kind: PrArtifactKind;
	role: JsonPayloadRole;
	schema?: z.ZodType<T> | undefined;
}): Promise<OperationResult<ResolvedSessionArtifact<T>, PayloadErrorType>> {
	return await resolveLatestJsonSessionArtifact({
		store: options.store,
		descriptor: prArtifactDescriptor({ prNumber: options.prNumber, kind: options.kind }),
		role: options.role,
		schema: options.schema,
	});
}

export async function resolveLatestPrBatchSessionArtifact<T = unknown>(options: {
	store: PayloadArtifactStore;
	prNumber: number;
	batchId: string;
	kind: "resolve-build" | "resolution" | "checkpoint";
	role: JsonPayloadRole;
	schema?: z.ZodType<T> | undefined;
}): Promise<OperationResult<ResolvedSessionArtifact<T>, PayloadErrorType>> {
	return await resolveLatestJsonSessionArtifact({
		store: options.store,
		descriptor: prBatchArtifactDescriptor({ prNumber: options.prNumber, batchId: options.batchId, kind: options.kind }),
		role: options.role,
		schema: options.schema,
	});
}

async function resolvePrScopedArtifact<T extends { pr_number: number | null }>(options: {
	store: PayloadArtifactStore;
	prNumber: number;
	kind: PrArtifactKind;
	role: JsonPayloadRole;
	schema: z.ZodType<T>;
	mismatchMessage: (actualPrNumber: number | null) => string;
}): Promise<OperationResult<ResolvedSessionArtifact<T>, PayloadErrorType | "invalid_request">> {
	const artifact = await resolveLatestPrSessionArtifact({
		store: options.store,
		prNumber: options.prNumber,
		kind: options.kind,
		role: options.role,
		schema: options.schema,
	});
	if (artifact.type === "error") return artifact;
	if (artifact.value.value.pr_number !== options.prNumber) {
		return { type: "error", errorType: "invalid_request", message: options.mismatchMessage(artifact.value.value.pr_number) };
	}
	return artifact;
}

async function resolvePrBatchScopedArtifact<T extends { pr_number: number | null; batch_id: string }>(options: {
	store: PayloadArtifactStore;
	prNumber: number;
	batchId: string;
	kind: "resolve-build" | "resolution" | "checkpoint";
	role: JsonPayloadRole;
	schema: z.ZodType<T>;
	mismatchMessage: () => string;
}): Promise<OperationResult<ResolvedSessionArtifact<T>, PayloadErrorType | "invalid_request">> {
	const artifact = await resolveLatestPrBatchSessionArtifact({
		store: options.store,
		prNumber: options.prNumber,
		batchId: options.batchId,
		kind: options.kind,
		role: options.role,
		schema: options.schema,
	});
	if (artifact.type === "error") return artifact;
	if (artifact.value.value.pr_number !== options.prNumber || artifact.value.value.batch_id !== options.batchId) {
		return { type: "error", errorType: "invalid_request", message: options.mismatchMessage() };
	}
	return artifact;
}

const rawFeedbackReviewSchema = z.looseObject({
	id: z.string(),
	author: z.string().default(""),
	body: z.string().default(""),
	state: z.string().default(""),
	submitted_at: z.string().default(""),
});
const rawFeedbackReviewCommentSchema = z.looseObject({
	id: z.number().int(),
	body: z.string().default(""),
	author: z.string().default(""),
	path: z.string().default(""),
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	created_at: z.string().default(""),
});
const rawFeedbackReviewThreadSchema = z.looseObject({
	id: z.string().optional(),
	thread_id: z.string().optional(),
	path: z.string().default(""),
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	is_resolved: z.boolean().default(false),
	is_outdated: z.boolean().default(false),
	comments: z.array(rawFeedbackReviewCommentSchema).default([]),
});
const rawFeedbackDiscussionCommentSchema = z.looseObject({
	id: z.number().int().optional(),
	comment_id: z.number().int().optional(),
	body: z.string().default(""),
	author: z.string().default(""),
	url: z.string().default(""),
});
const rawFeedbackEnvelopeSchema = z.looseObject({
	data: z.looseObject({
		reviews: z.array(rawFeedbackReviewSchema).default([]),
		review_threads: z.array(rawFeedbackReviewThreadSchema).default([]),
		discussion_comments: z.array(rawFeedbackDiscussionCommentSchema).default([]),
	}),
});

function manifestFromRawFeedbackArtifact(options: {
	value: unknown;
	reference: PayloadReference;
	prNumber: number;
}): OperationResult<GetFeedbackManifest, "invalid_request"> {
	const parsed = rawFeedbackEnvelopeSchema.safeParse(options.value);
	if (!parsed.success) return { type: "error", errorType: "invalid_request", message: `Latest raw feedback artifact is not a pr-address get-feedback envelope: ${z.prettifyError(parsed.error)}` };
	const reviewThreads = parsed.data.data.review_threads.map((thread) => ({ ...thread, id: thread.id ?? thread.thread_id ?? "" })).filter((thread) => thread.id !== "");
	const discussionComments = parsed.data.data.discussion_comments.map((comment) => ({ ...comment, id: comment.id ?? comment.comment_id ?? 0 })).filter((comment) => comment.id !== 0);
	const manifest = buildGetFeedbackPayloadManifest({
		payload_reference: options.reference,
		pr_number: options.prNumber,
		reviews: parsed.data.data.reviews,
		review_threads: reviewThreads,
		discussion_comments: discussionComments,
	});
	const manifestResult = getFeedbackManifestSchema.safeParse(manifest);
	if (!manifestResult.success) return { type: "error", errorType: "invalid_request", message: `Latest raw feedback artifact could not be converted to finalization feedback: ${z.prettifyError(manifestResult.error)}` };
	return { type: "ok", value: manifestResult.data };
}

export async function resolvePrFeedbackSourceFromSession(options: {
	ctx: PrAddressExecContext;
	prNumber: number;
	harnessSessionId?: string | undefined;
}): Promise<OperationResult<PrFeedbackSessionSourceResolution>> {
	if (options.prNumber <= 0) return { type: "error", errorType: "invalid_request", message: "--pr-number must be a positive integer." };
	const storeResult = await openPayloadStoreFromContext({ ctx: options.ctx, harnessSessionId: options.harnessSessionId });
	if (storeResult.type === "error") return storeResult;
	const artifact = await resolveLatestPrSessionArtifact({ store: storeResult.value, prNumber: options.prNumber, kind: "feedback", role: "raw" });
	if (artifact.type === "error") return artifact;
	return {
		type: "ok",
		value: { kind: "session", payloadPath: artifact.value.reference.payload_path, store: storeResult.value, resolvedInput: artifact.value.reference },
	};
}

export async function resolvePrManifestSessionInput(options: {
	ctx: PrAddressExecContext;
	prNumber: number;
	harnessSessionId?: string | undefined;
}): Promise<OperationResult<PrManifestSessionInput, PayloadErrorType | "invalid_request">> {
	if (options.prNumber <= 0) return { type: "error", errorType: "invalid_request", message: "--pr-number must be a positive integer." };
	const storeResult = await openPayloadStoreFromContext({ ctx: options.ctx, harnessSessionId: options.harnessSessionId });
	if (storeResult.type === "error") return storeResult;
	const artifact = await resolvePrScopedArtifact({
		store: storeResult.value,
		prNumber: options.prNumber,
		kind: "manifest",
		role: "summary",
		schema: getFeedbackManifestSchema,
		mismatchMessage: (actualPrNumber) => `Resolved manifest artifact PR number ${actualPrNumber} does not match requested PR ${options.prNumber}.`,
	});
	if (artifact.type === "error") return artifact;
	return { type: "ok", value: { store: storeResult.value, manifest: artifact.value.value, resolvedInput: artifact.value.reference } };
}

export async function resolveResolveThreadBuildPlanSessionInput(options: {
	ctx: PrAddressExecContext;
	prNumber: number;
	harnessSessionId?: string | undefined;
}): Promise<OperationResult<ResolveThreadBuildPlanSessionInput, PayloadErrorType | "invalid_request">> {
	if (options.prNumber <= 0) return { type: "error", errorType: "invalid_request", message: "--pr-number must be a positive integer." };
	const storeResult = await openPayloadStoreFromContext({ ctx: options.ctx, harnessSessionId: options.harnessSessionId });
	if (storeResult.type === "error") return storeResult;
	const artifact = await resolvePrScopedArtifact({
		store: storeResult.value,
		prNumber: options.prNumber,
		kind: "plan",
		role: "summary",
		schema: feedbackPlanConsumerSchema,
		mismatchMessage: (actualPrNumber) => `Resolved plan artifact PR number ${actualPrNumber} does not match requested PR ${options.prNumber}.`,
	});
	if (artifact.type === "error") return artifact;
	return { type: "ok", value: { store: storeResult.value, plan: artifact.value.value, resolvedInput: artifact.value.reference } };
}

export interface BatchCheckpointSessionInputs {
	store: PayloadArtifactStore;
	plan: FeedbackPlanConsumer;
	batch: FeedbackPlanBatch;
	resolvedInputs: {
		plan: PayloadReference;
		build: PayloadReference | null;
		resolution: PayloadReference | null;
	};
	buildArtifact: ThreadResolutionBuildArtifact | null;
	resolutionArtifact: ThreadResolutionResultArtifact | null;
}

export interface FinalizeRunSessionInputs {
	payload: {
		feedback: GetFeedbackManifest;
		checkpoints: unknown[];
		expected_batches: Array<{ batch_id: string }>;
		missing_checkpoints: Array<{ batch_id: string }>;
	};
	resolvedInputs: {
		plan: PayloadReference;
		feedback: PayloadReference;
		checkpoints: Array<{ batch_id: string; reference: PayloadReference }>;
	};
}

export async function resolveBatchCheckpointSessionInputs(options: {
	ctx: PrAddressExecContext;
	prNumber: number;
	batchId: string;
	harnessSessionId?: string | undefined;
}): Promise<OperationResult<BatchCheckpointSessionInputs, PayloadErrorType | "invalid_request">> {
	const planInput = await resolveResolveThreadBuildPlanSessionInput(options);
	if (planInput.type === "error") return planInput;
	const batch = planInput.value.plan.batches.find((item) => item.batch_id === options.batchId) ?? null;
	if (batch === null) return { type: "error", errorType: "invalid_request", message: `No plan batch found for batch_id '${options.batchId}'.` };
	const hasReviewThreadItems = batch.items.some((item) => item.source_kind === "review_thread");
	if (!hasReviewThreadItems) {
		return {
			type: "ok",
			value: {
				store: planInput.value.store,
				plan: planInput.value.plan,
				batch,
				resolvedInputs: { plan: planInput.value.resolvedInput, build: null, resolution: null },
				buildArtifact: null,
				resolutionArtifact: null,
			},
		};
	}
	const build = await resolvePrBatchScopedArtifact({
		store: planInput.value.store,
		prNumber: options.prNumber,
		batchId: options.batchId,
		kind: "resolve-build",
		role: "summary",
		schema: threadResolutionBuildArtifactSchema,
		mismatchMessage: () => `Resolved build artifact does not match requested PR ${options.prNumber} batch ${options.batchId}.`,
	});
	if (build.type === "error") return build;
	if (build.value.value.payload_ready !== true) {
		return {
			type: "ok",
			value: {
				store: planInput.value.store,
				plan: planInput.value.plan,
				batch,
				resolvedInputs: { plan: planInput.value.resolvedInput, build: build.value.reference, resolution: null },
				buildArtifact: build.value.value,
				resolutionArtifact: null,
			},
		};
	}
	const resolution = await resolvePrBatchScopedArtifact({
		store: planInput.value.store,
		prNumber: options.prNumber,
		batchId: options.batchId,
		kind: "resolution",
		role: "summary",
		schema: threadResolutionResultArtifactSchema,
		mismatchMessage: () => `Resolved resolution artifact does not match requested PR ${options.prNumber} batch ${options.batchId}.`,
	});
	if (resolution.type === "error") return resolution;
	if (resolution.value.value.build_reference.payload_path !== build.value.reference.payload_path) {
		return { type: "error", errorType: "invalid_request", message: `Resolved resolution artifact does not reference the latest build artifact for batch ${options.batchId}.` };
	}
	return {
		type: "ok",
		value: {
			store: planInput.value.store,
			plan: planInput.value.plan,
			batch,
			resolvedInputs: { plan: planInput.value.resolvedInput, build: build.value.reference, resolution: resolution.value.reference },
			buildArtifact: build.value.value,
			resolutionArtifact: resolution.value.value,
		},
	};
}

export async function resolveFinalizeRunSessionInput(options: {
	ctx: PrAddressExecContext;
	prNumber: number;
	harnessSessionId?: string | undefined;
}): Promise<OperationResult<FinalizeRunSessionInputs, PayloadErrorType | "invalid_request">> {
	const planInput = await resolveResolveThreadBuildPlanSessionInput(options);
	if (planInput.type === "error") return planInput;
	const feedback = await resolveLatestPrSessionArtifact({ store: planInput.value.store, prNumber: options.prNumber, kind: "feedback", role: "raw" });
	if (feedback.type === "error") return feedback;
	const manifest = manifestFromRawFeedbackArtifact({ value: feedback.value.value, reference: feedback.value.reference, prNumber: options.prNumber });
	if (manifest.type === "error") return manifest;
	const checkpoints: unknown[] = [];
	const resolvedCheckpoints: Array<{ batch_id: string; reference: PayloadReference }> = [];
	const missingCheckpoints: Array<{ batch_id: string }> = [];
	for (const batch of planInput.value.plan.batches) {
		const checkpoint = await resolveLatestPrBatchSessionArtifact({
			store: planInput.value.store,
			prNumber: options.prNumber,
			batchId: batch.batch_id,
			kind: "checkpoint",
			role: "summary",
		});
		if (checkpoint.type === "error") {
			if (checkpoint.errorType === "payload_lookup_failed" && checkpoint.message.startsWith("No JSON payload artifact found")) {
				missingCheckpoints.push({ batch_id: batch.batch_id });
				continue;
			}
			return checkpoint;
		}
		checkpoints.push(checkpoint.value.value);
		resolvedCheckpoints.push({ batch_id: batch.batch_id, reference: checkpoint.value.reference });
	}
	return {
		type: "ok",
		value: {
			payload: {
				feedback: manifest.value,
				checkpoints,
				expected_batches: planInput.value.plan.batches.map((batch) => ({ batch_id: batch.batch_id })),
				missing_checkpoints: missingCheckpoints,
			},
			resolvedInputs: { plan: planInput.value.resolvedInput, feedback: feedback.value.reference, checkpoints: resolvedCheckpoints },
		},
	};
}

export async function resolvePlanFeedbackSessionInputs(options: {
	ctx: PrAddressExecContext;
	prNumber: number;
	harnessSessionId?: string | undefined;
}): Promise<OperationResult<PlanFeedbackSessionInputs>> {
	const manifest = await resolvePrManifestSessionInput(options);
	if (manifest.type === "error") return manifest;
	const classification = await resolvePrScopedArtifact({
		store: manifest.value.store,
		prNumber: options.prNumber,
		kind: "classification",
		role: "summary",
		schema: classificationArtifactSchema,
		mismatchMessage: (actualPrNumber) => `Resolved classification artifact PR number ${actualPrNumber} does not match requested PR ${options.prNumber}.`,
	});
	if (classification.type === "error") return classification;
	return {
		type: "ok",
		value: {
			store: manifest.value.store,
			manifest: manifest.value.manifest,
			classification: classification.value.value,
			resolvedInputs: { manifest: manifest.value.resolvedInput, classification: classification.value.reference },
		},
	};
}

export async function resolveLatestStackSessionArtifact<T>(options: {
	store: PayloadArtifactStore;
	kind: StackArtifactKind;
	role: JsonPayloadRole;
	schema?: z.ZodType<T> | undefined;
}): Promise<OperationResult<ResolvedSessionArtifact<T>, PayloadErrorType>> {
	return await resolveLatestJsonSessionArtifact({
		store: options.store,
		descriptor: stackArtifactDescriptor(options.kind),
		role: options.role,
		schema: options.schema,
	});
}

export async function resolveStackResolveThreadBuildPlanSessionInput(options: {
	ctx: PrAddressExecContext;
	harnessSessionId?: string | undefined;
}): Promise<OperationResult<StackResolveThreadBuildPlanSessionInput, PayloadErrorType>> {
	const storeResult = await openPayloadStoreFromContext({ ctx: options.ctx, harnessSessionId: options.harnessSessionId });
	if (storeResult.type === "error") return storeResult;
	const artifact = await resolveLatestStackSessionArtifact({
		store: storeResult.value,
		kind: "plan",
		role: "summary",
		schema: stackFeedbackPlanConsumerResultSchema,
	});
	if (artifact.type === "error") return artifact;
	return { type: "ok", value: { store: storeResult.value, plan: artifact.value.value, resolvedInput: artifact.value.reference } };
}

export async function resolveStackFeedbackPlanSessionInput(store: PayloadArtifactStore): Promise<OperationResult<StackFeedbackPlanSessionInputResult>> {
	const prep = await resolveLatestStackSessionArtifact({
		store,
		kind: "prep",
		role: "summary",
		schema: stackFeedbackPrepResultInputSchema,
	});
	if (prep.type === "error") return prep;
	const classifications: StackFeedbackPlanInput["classifications"] = [];
	const resolvedClassifications: StackFeedbackPlanResolvedInputs["classifications"] = [];
	for (const prResult of prep.value.value.stack) {
		const classification = await resolvePrScopedArtifact({
			store,
			prNumber: prResult.pr_number,
			kind: "classification",
			role: "summary",
			schema: classificationArtifactSchema,
			mismatchMessage: (actualPrNumber) => `Resolved classification artifact PR number ${actualPrNumber} does not match stack prep PR ${prResult.pr_number}.`,
		});
		if (classification.type === "error") return classification;
		classifications.push({ pr_number: prResult.pr_number, classification: classification.value.value.classification });
		resolvedClassifications.push({ pr_number: prResult.pr_number, reference: classification.value.reference });
	}
	return {
		type: "ok",
		value: {
			payload: { prep: prep.value.value, classifications },
			resolvedInputs: { prep: prep.value.reference, classifications: resolvedClassifications },
		},
	};
}

export async function resolveStackFeedbackDiffCurrentSessionInput(store: PayloadArtifactStore): Promise<OperationResult<StackFeedbackDiffCurrentSessionInputResult>> {
	const stackPlan = await resolveLatestStackSessionArtifact({
		store,
		kind: "plan",
		role: "summary",
		schema: stackFeedbackPlanConsumerResultSchema,
	});
	if (stackPlan.type === "error") return stackPlan;
	const currentPrep = await resolveLatestStackSessionArtifact({
		store,
		kind: "prep",
		role: "summary",
		schema: stackFeedbackPrepResultWithManifestSchema,
	});
	if (currentPrep.type === "error") return currentPrep;
	return {
		type: "ok",
		value: {
			payload: { stack_plan: stackPlan.value.value, current_prep: currentPrep.value.value },
			resolvedInputs: { stack_plan: stackPlan.value.reference, current_prep: currentPrep.value.reference },
		},
	};
}
