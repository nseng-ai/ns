import { z } from "zod";

import type { PrAddressExecContext } from "./exec-operation.ts";
import { getFeedbackManifestSchema, type GetFeedbackManifest } from "./feedback-manifest-contracts.ts";
import type { JsonInputError } from "./json-input.ts";
import type { JsonPayloadRole, PayloadArtifactStore, PayloadErrorType, PayloadReference, PayloadResult, ResolvedJsonPayloadArtifact } from "./payload-store.ts";
import {
	checkpointArtifactSchema,
	classificationArtifactSchema,
	prArtifactDescriptor,
	prBatchArtifactDescriptor,
	resolveBuildArtifactSchema,
	resolveLatestJsonSessionArtifact,
	stackArtifactDescriptor,
	threadResolutionArtifactSchema,
	type CheckpointArtifact,
	type ClassificationArtifact,
	type PrArtifactKind,
	type ResolvedSessionArtifact,
	type ResolveBuildArtifact,
	type StackArtifactKind,
	type ThreadResolutionArtifact,
} from "./session-artifacts.ts";
import { feedbackPlanConsumerSchema, type FeedbackPlanConsumer } from "./feedback-plan-contracts.ts";
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

export interface ResolvedOperationInput<T> {
	source: OperationInputSourceKind;
	value: T;
}

/**
 * Central policy for exec operations that accept explicit payload inputs, payload-session inputs, and/or stdin.
 * Non-empty stdin is deliberately configurable: most commands treat it as the payload channel, while
 * stack-feedback-plan preserves its legacy inline-JSON compatibility path as a named policy choice.
 */
export interface ResolveOperationInputOptions<T> {
	commandName: string;
	explicitSource: {
		hasExplicitSource: boolean;
		description: string;
		resolve: (stdin: () => Promise<string>) => Promise<OperationResult<T, string>>;
	};
	sessionSource?:
		| {
				/** True when a user selected session mode explicitly, e.g. with --pr-number. */
				isSelected: boolean;
				description: string;
				resolve: () => Promise<OperationResult<T, string>>;
			}
		| undefined;
	stdin?:
		| {
				read: () => Promise<string>;
				nonEmptyMode: "payload" | "inline-json";
				resolveInlineJson?: (stdinText: string) => OperationResult<T, string> | Promise<OperationResult<T, string>>;
			}
		| undefined;
	/** Source to use after no explicit source, no selected session source, and empty stdin. */
	defaultSource: "explicit" | "session" | "error";
	mixInputMessage?: string | undefined;
	missingInputMessage?: string | undefined;
}

export async function resolveOperationInput<T>(options: ResolveOperationInputOptions<T>): Promise<OperationResult<ResolvedOperationInput<T>, string>> {
	const hasSelectedSessionSource = options.sessionSource?.isSelected ?? false;
	if (options.explicitSource.hasExplicitSource && hasSelectedSessionSource) {
		return { type: "error", errorType: "invalid_request", message: options.mixInputMessage ?? defaultMixInputMessage(options) };
	}
	if (options.explicitSource.hasExplicitSource) return await resolveExplicitOperationInput(options, options.stdin?.read ?? emptyStdin);
	if (hasSelectedSessionSource) return await resolveSessionOperationInput(options);

	if (options.stdin !== undefined) {
		const stdinText = await options.stdin.read();
		if (stdinText.trim() !== "") return await resolveStdinOperationInput(options, stdinText);
		return await resolveDefaultOperationInput(options, async () => stdinText);
	}

	return await resolveDefaultOperationInput(options, emptyStdin);
}

async function resolveExplicitOperationInput<T>(
	options: ResolveOperationInputOptions<T>,
	stdin: () => Promise<string>,
): Promise<OperationResult<ResolvedOperationInput<T>, string>> {
	const result = await options.explicitSource.resolve(stdin);
	if (result.type === "error") return result;
	return { type: "ok", value: { source: "explicit", value: result.value } };
}

async function resolveSessionOperationInput<T>(options: ResolveOperationInputOptions<T>): Promise<OperationResult<ResolvedOperationInput<T>, string>> {
	if (options.sessionSource === undefined) throw new Error(`${options.commandName} session source was selected without a resolver.`);
	const result = await options.sessionSource.resolve();
	if (result.type === "error") return result;
	return { type: "ok", value: { source: "session", value: result.value } };
}

async function resolveStdinOperationInput<T>(
	options: ResolveOperationInputOptions<T>,
	stdinText: string,
): Promise<OperationResult<ResolvedOperationInput<T>, string>> {
	if (options.stdin === undefined) throw new Error(`${options.commandName} stdin source was selected without a policy.`);
	if (options.stdin.nonEmptyMode === "payload") {
		const result = await options.explicitSource.resolve(async () => stdinText);
		if (result.type === "error") return result;
		return { type: "ok", value: { source: "stdin", value: result.value } };
	}
	if (options.stdin.resolveInlineJson === undefined) throw new Error(`${options.commandName} inline-JSON stdin mode requires an inline resolver.`);
	const result = await options.stdin.resolveInlineJson(stdinText);
	if (result.type === "error") return result;
	return { type: "ok", value: { source: "stdin", value: result.value } };
}

async function resolveDefaultOperationInput<T>(
	options: ResolveOperationInputOptions<T>,
	stdin: () => Promise<string>,
): Promise<OperationResult<ResolvedOperationInput<T>, string>> {
	if (options.defaultSource === "explicit") return await resolveExplicitOperationInput(options, stdin);
	if (options.defaultSource === "session") return await resolveSessionOperationInput(options);
	return { type: "error", errorType: "invalid_request", message: options.missingInputMessage ?? defaultMissingInputMessage(options) };
}

function defaultMixInputMessage<T>(options: ResolveOperationInputOptions<T>): string {
	return `${options.commandName} cannot mix ${options.explicitSource.description} with ${options.sessionSource?.description ?? "session input"}; pass exactly one input source.`;
}

function defaultMissingInputMessage<T>(options: ResolveOperationInputOptions<T>): string {
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

export interface ResolvedPrBatchArtifacts {
	resolveBuild?: PayloadReference | undefined;
	threadResolution?: PayloadReference | undefined;
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

export async function resolvePlanFeedbackSessionInputs(options: {
	ctx: PrAddressExecContext;
	prNumber: number;
	harnessSessionId?: string | undefined;
}): Promise<OperationResult<PlanFeedbackSessionInputs>> {
	const storeResult = await openPayloadStoreFromContext({ ctx: options.ctx, harnessSessionId: options.harnessSessionId });
	if (storeResult.type === "error") return storeResult;
	const store = storeResult.value;
	const manifest = await resolveLatestPrSessionArtifact({
		store,
		prNumber: options.prNumber,
		kind: "manifest",
		role: "summary",
		schema: getFeedbackManifestSchema,
	});
	if (manifest.type === "error") return manifest;
	const classification = await resolveLatestPrSessionArtifact({
		store,
		prNumber: options.prNumber,
		kind: "classification",
		role: "summary",
		schema: classificationArtifactSchema,
	});
	if (classification.type === "error") return classification;
	if (classification.value.value.pr_number !== options.prNumber) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: `Resolved classification artifact PR number ${classification.value.value.pr_number} does not match requested PR ${options.prNumber}.`,
		};
	}
	return {
		type: "ok",
		value: {
			store,
			manifest: manifest.value.value,
			classification: classification.value.value,
			resolvedInputs: { manifest: manifest.value.reference, classification: classification.value.reference },
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

export async function resolveLatestPrPlanArtifact(options: {
	store: PayloadArtifactStore;
	prNumber: number;
}): Promise<OperationResult<ResolvedSessionArtifact<FeedbackPlanConsumer>, PayloadErrorType>> {
	return await resolveLatestPrSessionArtifact({ store: options.store, prNumber: options.prNumber, kind: "plan", role: "summary", schema: feedbackPlanConsumerSchema });
}

export async function resolveLatestStackPlanArtifact(store: PayloadArtifactStore): Promise<OperationResult<ResolvedSessionArtifact<StackFeedbackPlanConsumerResult>, PayloadErrorType>> {
	return await resolveLatestStackSessionArtifact({ store, kind: "plan", role: "summary", schema: stackFeedbackPlanConsumerResultSchema });
}

export async function resolveResolveBuildArtifactBySequence(options: {
	store: PayloadArtifactStore;
	sequence: number;
	prNumber?: number | undefined;
	batchId?: string | undefined;
}): Promise<OperationResult<ResolvedSessionArtifact<ResolveBuildArtifact>, PayloadErrorType | "invalid_request">> {
	return await resolvePrBatchArtifactValue({
		artifact: await options.store.findJsonArtifactBySequence({ sequence: options.sequence, role: "summary" }),
		schema: resolveBuildArtifactSchema,
		kind: "resolve_build",
		prNumber: options.prNumber,
		batchId: options.batchId,
	});
}

export async function resolveThreadResolutionArtifactBySequence(options: {
	store: PayloadArtifactStore;
	sequence: number;
	prNumber?: number | undefined;
	batchId?: string | undefined;
}): Promise<OperationResult<ResolvedSessionArtifact<ThreadResolutionArtifact>, PayloadErrorType | "invalid_request">> {
	return await resolvePrBatchArtifactValue({
		artifact: await options.store.findJsonArtifactBySequence({ sequence: options.sequence, role: "summary" }),
		schema: threadResolutionArtifactSchema,
		kind: "thread_resolution",
		prNumber: options.prNumber,
		batchId: options.batchId,
	});
}

export async function resolveResolveBuildArtifactByPath(options: {
	ctx: PrAddressExecContext;
	payloadPath: string;
	prNumber?: number | undefined;
	batchId?: string | undefined;
}): Promise<OperationResult<ResolvedSessionArtifact<ResolveBuildArtifact>, PayloadErrorType | "invalid_request">> {
	const artifact = await resolveJsonArtifactByPath(options.ctx, options.payloadPath);
	return await resolvePrBatchArtifactValue({ artifact, schema: resolveBuildArtifactSchema, kind: "resolve_build", prNumber: options.prNumber, batchId: options.batchId });
}

export async function resolveThreadResolutionArtifactByPath(options: {
	ctx: PrAddressExecContext;
	payloadPath: string;
	prNumber?: number | undefined;
	batchId?: string | undefined;
}): Promise<OperationResult<ResolvedSessionArtifact<ThreadResolutionArtifact>, PayloadErrorType | "invalid_request">> {
	const artifact = await resolveJsonArtifactByPath(options.ctx, options.payloadPath);
	return await resolvePrBatchArtifactValue({ artifact, schema: threadResolutionArtifactSchema, kind: "thread_resolution", prNumber: options.prNumber, batchId: options.batchId });
}

export async function resolveLatestResolveBuildArtifact(options: {
	store: PayloadArtifactStore;
	prNumber: number;
	batchId: string;
}): Promise<OperationResult<ResolvedSessionArtifact<ResolveBuildArtifact>, PayloadErrorType | "invalid_request">> {
	return await resolvePrBatchArtifactValue({
		artifact: await options.store.findLatestJsonArtifact({ descriptor: prBatchArtifactDescriptor({ prNumber: options.prNumber, batchId: options.batchId, kind: "resolve-build" }), role: "summary" }),
		schema: resolveBuildArtifactSchema,
		kind: "resolve_build",
		prNumber: options.prNumber,
		batchId: options.batchId,
	});
}

export async function resolveLatestThreadResolutionArtifact(options: {
	store: PayloadArtifactStore;
	prNumber: number;
	batchId: string;
}): Promise<OperationResult<ResolvedSessionArtifact<ThreadResolutionArtifact>, PayloadErrorType | "invalid_request">> {
	return await resolvePrBatchArtifactValue({
		artifact: await options.store.findLatestJsonArtifact({ descriptor: prBatchArtifactDescriptor({ prNumber: options.prNumber, batchId: options.batchId, kind: "thread-resolution" }), role: "summary" }),
		schema: threadResolutionArtifactSchema,
		kind: "thread_resolution",
		prNumber: options.prNumber,
		batchId: options.batchId,
	});
}

export async function listPrCheckpointArtifacts(options: {
	store: PayloadArtifactStore;
	prNumber: number;
}): Promise<OperationResult<readonly ResolvedSessionArtifact<CheckpointArtifact>[], PayloadErrorType | "invalid_request">> {
	const prefix = `pr-address-pr-${options.prNumber}-batch-`;
	const listed = await options.store.listJsonArtifacts({ descriptorPrefix: prefix, role: "summary" });
	if (listed.type === "error") return listed;
	const checkpoints: Array<ResolvedSessionArtifact<CheckpointArtifact>> = [];
	for (const artifact of listed.value.filter((candidate) => candidate.reference.descriptor.endsWith("-checkpoint"))) {
		const resolved = await resolvePrBatchArtifactValue({ artifact: { type: "ok", value: artifact }, schema: checkpointArtifactSchema, kind: "checkpoint", prNumber: options.prNumber });
		if (resolved.type === "error") return resolved;
		checkpoints.push(resolved.value);
	}
	return { type: "ok", value: checkpoints };
}

async function resolveJsonArtifactByPath(ctx: PrAddressExecContext, payloadPath: string): Promise<PayloadResult<ResolvedJsonPayloadArtifact>> {
	const storeResult = await ctx.context.payloadStoreFactory.openContainingArtifact(payloadPath, { clock: ctx.context.payloadClock });
	if (storeResult.type === "error") return storeResult;
	const listed = await storeResult.value.listJsonArtifacts({ role: "summary" });
	if (listed.type === "error") return listed;
	const match = listed.value.find((artifact) => artifact.reference.payload_path === payloadPath);
	if (match === undefined) return { type: "error", errorType: "payload_lookup_failed", message: `Payload artifact path does not exist in its containing session: ${payloadPath}` };
	return { type: "ok", value: match };
}

async function resolvePrBatchArtifactValue<T extends { artifact_kind: string; pr_number?: number | null | undefined; batch_id?: string | undefined }>(options: {
	artifact: PayloadResult<ResolvedJsonPayloadArtifact>;
	schema: z.ZodType<T>;
	kind: string;
	prNumber?: number | undefined;
	batchId?: string | undefined;
}): Promise<OperationResult<ResolvedSessionArtifact<T>, PayloadErrorType | "invalid_request">> {
	if (options.artifact.type === "error") return options.artifact;
	const parsed = options.schema.safeParse(options.artifact.value.value);
	if (!parsed.success) return { type: "error", errorType: "payload_lookup_failed", message: `Referenced ${options.kind} artifact failed schema validation: ${z.prettifyError(parsed.error)}` };
	if (parsed.data.artifact_kind !== options.kind) return { type: "error", errorType: "invalid_request", message: `Referenced artifact kind ${parsed.data.artifact_kind} does not match expected ${options.kind}.` };
	if (options.prNumber !== undefined && parsed.data.pr_number !== options.prNumber) {
		return { type: "error", errorType: "invalid_request", message: `Referenced artifact PR ${String(parsed.data.pr_number)} does not match requested PR ${options.prNumber}.` };
	}
	if (options.batchId !== undefined && parsed.data.batch_id !== options.batchId) {
		return { type: "error", errorType: "invalid_request", message: `Referenced artifact batch ${String(parsed.data.batch_id)} does not match requested batch ${options.batchId}.` };
	}
	return { type: "ok", value: { reference: options.artifact.value.reference, value: parsed.data } };
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
		const classification = await resolveLatestPrSessionArtifact({
			store,
			prNumber: prResult.pr_number,
			kind: "classification",
			role: "summary",
			schema: classificationArtifactSchema,
		});
		if (classification.type === "error") return classification;
		if (classification.value.value.pr_number !== prResult.pr_number) {
			return {
				type: "error",
				errorType: "invalid_request",
				message: `Resolved classification artifact PR number ${classification.value.value.pr_number} does not match stack prep PR ${prResult.pr_number}.`,
			};
		}
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
