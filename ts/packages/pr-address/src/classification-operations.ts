import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";

import { buildFeedbackClassificationTemplate, planFeedback, validateFeedbackClassification, type FeedbackClassificationValidationResult } from "./classification.ts";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { loadJsonInput, loadJsonRecord } from "./json-input.ts";
import type { PayloadArtifactStore, PayloadReference } from "./payload-store.ts";
import { prArtifactDescriptor } from "./session-artifacts.ts";
import { resolveOperationInput, resolvePlanFeedbackSessionInputs, resolvePrManifestSessionInput, type OperationResult } from "./session-inputs.ts";

const wrapperPayloadSchema = z.looseObject({
	manifest: z.unknown(),
	classification: z.unknown(),
});

type WrapperPayload = z.infer<typeof wrapperPayloadSchema>;

const classificationTemplateParseSchema = z.object({
	manifest_json: z.string().optional(),
	manifest_file: z.string().optional(),
	pr_number: z.number().int().optional(),
	harness_session_id: z.string().optional(),
});

export const classificationTemplateOperation = defineExecOperation({
	spec: {
		name: "classification-template",
		description: "Build a deterministic classification scaffold from a compact payload manifest.",
		schema: classificationTemplateParseSchema,
		handler: runClassificationTemplateOperation,
	},
});

const validateFeedbackClassificationParseSchema = z.object({
	payload_json: z.string().optional(),
	payload_file: z.string().optional(),
	manifest_json: z.string().optional(),
	manifest_file: z.string().optional(),
	classification_json: z.string().optional(),
	classification_file: z.string().optional(),
	pr_number: z.number().int().optional(),
	harness_session_id: z.string().optional(),
	persist_session: z.boolean().default(false),
});

const VALIDATE_FEEDBACK_CLASSIFICATION_COMMAND = "validate-feedback-classification";
const VALIDATE_WRAPPER_INPUT_DESCRIPTION = "wrapper input (--payload-json/--payload-file)";
const VALIDATE_MANIFEST_INPUT_DESCRIPTION = "manifest input (--manifest-json/--manifest-file)";

function validateSessionMixMessage(inputDescription: string): string {
	return `${VALIDATE_FEEDBACK_CLASSIFICATION_COMMAND} cannot mix session resolution (--pr-number) with ${inputDescription}.`;
}

export const validateFeedbackClassificationOperation = defineExecOperation({
	spec: {
		name: "validate-feedback-classification",
		description: "Validate a PR feedback classification packet against a compact payload manifest.",
		schema: validateFeedbackClassificationParseSchema,
		handler: runValidateFeedbackClassificationOperation,
	},
});

const planFeedbackParseSchema = z.object({
	payload_json: z.string().optional(),
	payload_file: z.string().optional(),
	pr_number: z.number().int().optional(),
	harness_session_id: z.string().optional(),
});

export const planFeedbackOperation = defineExecOperation({
	spec: {
		name: "plan-feedback",
		description: "Plan deterministic PR feedback execution batches from a validated classification packet.",
		schema: planFeedbackParseSchema,
		handler: runPlanFeedbackOperation,
	},
});

interface ClassificationTemplateInput {
	manifest: unknown;
	resolvedInputs?: { manifest: PayloadReference } | undefined;
}

async function runClassificationTemplateOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof classificationTemplateParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const hasManifestInput = request.manifest_json !== undefined || request.manifest_file !== undefined;
	const inputResult = await resolveOperationInput<ClassificationTemplateInput>({
		commandName: "classification-template",
		explicitSource: {
			hasExplicitSource: hasManifestInput,
			description: "manifest input (--manifest-json/--manifest-file)",
			resolve: async (stdin) => await loadClassificationTemplateManifestInput(request, stdin),
		},
		stdin: { read: ctx.stdin, nonEmptyMode: "payload" },
		sessionSource: {
			isSelected: request.pr_number !== undefined,
			description: "session resolution (--pr-number)",
			resolve: async () => await loadClassificationTemplateSessionInput(ctx, request),
		},
		defaultSource: "explicit",
		mixInputMessage: "classification-template cannot mix session resolution (--pr-number) with manifest input (--manifest-json/--manifest-file).",
	});
	if (inputResult.type === "error") return failure(inputResult.errorType, inputResult.message);

	const input = inputResult.value.value;
	const result = buildFeedbackClassificationTemplate(input.manifest);
	if (result.type === "error") return failure("invalid_request", result.message);
	if (input.resolvedInputs === undefined) return ok(result.value);
	return ok({ ...result.value, resolved_inputs: input.resolvedInputs });
}

async function loadClassificationTemplateManifestInput(
	request: z.output<typeof classificationTemplateParseSchema>,
	stdin: () => Promise<string>,
): Promise<OperationResult<ClassificationTemplateInput, string>> {
	const manifestResult = await loadJsonRecord({
		optionValue: request.manifest_json,
		filePath: request.manifest_file,
		canReadStdin: true,
		commandName: "classification-template",
		inputDescription: "compact manifest",
		optionName: "--manifest-json",
		fileOptionName: "--manifest-file",
		stdin,
	});
	if (manifestResult.type === "error") return { type: "error", errorType: manifestResult.error.errorType, message: manifestResult.error.message };
	return { type: "ok", value: { manifest: manifestResult.value } };
}

async function loadClassificationTemplateSessionInput(
	ctx: PrAddressExecContext,
	request: z.output<typeof classificationTemplateParseSchema>,
): Promise<OperationResult<ClassificationTemplateInput, string>> {
	if (request.pr_number === undefined) throw new Error("classification-template session source was selected without pr_number");
	const sessionInput = await resolvePrManifestSessionInput({ ctx, prNumber: request.pr_number, harnessSessionId: request.harness_session_id });
	if (sessionInput.type === "error") return sessionInput;
	return { type: "ok", value: { manifest: sessionInput.value.manifest, resolvedInputs: { manifest: sessionInput.value.resolvedInput } } };
}

async function runValidateFeedbackClassificationOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadValidatePayload(ctx, request, ctx.stdin);
	if (payloadResult.type === "error") return failure(payloadResult.errorType, payloadResult.message);

	const input = payloadResult.value;
	const result = validateFeedbackClassification({ manifest: input.manifest, classification: input.classification });
	const resultWithResolvedInputs = input.source === "session" ? { ...result, resolved_inputs: input.session.resolvedInputs } : result;
	if (!result.valid) return negative("PR feedback classification failed validation.", resultWithResolvedInputs);

	const classificationReference = await persistValidatedClassification({ ctx, request, input, result });
	if (classificationReference.type === "error") return failure(classificationReference.errorType, classificationReference.message);
	return ok({ ...resultWithResolvedInputs, classification_reference: classificationReference.value });
}

type PlanFeedbackResolvedInput = { type: "wrapper"; payload: WrapperPayload } | { type: "session"; prNumber: number };

async function runPlanFeedbackOperation(ctx: PrAddressExecContext, request: z.output<typeof planFeedbackParseSchema>): Promise<ClinkrExit<unknown>> {
	const inputResult = await resolveOperationInput<PlanFeedbackResolvedInput>({
		commandName: "plan-feedback",
		explicitSource: {
			hasExplicitSource: request.payload_json !== undefined || request.payload_file !== undefined,
			description: "wrapper input (--payload-json/--payload-file)",
			resolve: async (stdin) => await loadPlanFeedbackWrapperInput(request, stdin),
		},
		stdin: { read: ctx.stdin, nonEmptyMode: "payload" },
		sessionSource: {
			isSelected: request.pr_number !== undefined,
			description: "session resolution (--pr-number)",
			resolve: async () => {
				if (request.pr_number === undefined) throw new Error("plan-feedback session source was selected without pr_number");
				return { type: "ok", value: { type: "session", prNumber: request.pr_number } };
			},
		},
		defaultSource: "explicit",
		mixInputMessage: "plan-feedback cannot mix session resolution (--pr-number) with wrapper input (--payload-json/--payload-file).",
	});
	if (inputResult.type === "error") return failure(inputResult.errorType, inputResult.message);
	const input = inputResult.value.value;
	if (input.type === "session") return await runPlanFeedbackFromSession(ctx, request, input.prNumber);

	const result = planFeedback({ manifest: input.payload.manifest, classification: input.payload.classification });
	if (result.valid) return ok(result);
	return negative("PR feedback classification failed validation; no plan produced.", result);
}

async function loadPlanFeedbackWrapperInput(
	request: z.output<typeof planFeedbackParseSchema>,
	stdin: () => Promise<string>,
): Promise<OperationResult<PlanFeedbackResolvedInput, string>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.payload_json,
		filePath: request.payload_file,
		commandName: "plan-feedback",
		inputDescription: "JSON payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: wrapperPayloadSchema,
		stdin,
	});
	if (payloadResult.type === "error") return { type: "error", errorType: payloadResult.error.errorType, message: payloadResult.error.message };
	return { type: "ok", value: { type: "wrapper", payload: payloadResult.value } };
}

type ValidateFeedbackClassificationInput =
	| { source: "explicit"; manifest: unknown; classification: unknown }
	| {
			source: "session";
			manifest: unknown;
			classification: unknown;
			session: {
				prNumber: number;
				store: PayloadArtifactStore;
				resolvedInputs: { manifest: PayloadReference };
			};
		};

async function persistValidatedClassification(options: {
	ctx: PrAddressExecContext;
	request: z.output<typeof validateFeedbackClassificationParseSchema>;
	input: ValidateFeedbackClassificationInput;
	result: FeedbackClassificationValidationResult;
}): Promise<OperationResult<PayloadReference | null>> {
	const shouldPersist = options.input.source === "session" || options.request.persist_session;
	if (!shouldPersist) return { type: "ok", value: null };
	if (options.result.pr_number === null) {
		return { type: "error", errorType: "invalid_request", message: "validate-feedback-classification cannot persist a PR-scoped classification without a PR number." };
	}
	const storeResult = await resolveValidationPersistenceStore(options);
	if (storeResult.type === "error") return storeResult;
	const artifact = { pr_number: options.result.pr_number, classification: options.input.classification, validation: options.result };
	const reference = await storeResult.value.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber: options.result.pr_number, kind: "classification" }),
		role: "summary",
		payload: artifact,
	});
	if (reference.type === "error") return reference;
	return { type: "ok", value: reference.value };
}

async function resolveValidationPersistenceStore(options: {
	ctx: PrAddressExecContext;
	request: z.output<typeof validateFeedbackClassificationParseSchema>;
	input: ValidateFeedbackClassificationInput;
}): Promise<OperationResult<PayloadArtifactStore>> {
	if (options.input.source === "session") return { type: "ok", value: options.input.session.store };
	const storeResult = await options.ctx.context.payloadStoreFactory.fromEnvironment({
		explicitHarnessSessionId: options.request.harness_session_id ?? null,
		env: options.ctx.env,
		clock: options.ctx.context.payloadClock,
	});
	if (storeResult.type === "error") return storeResult;
	return { type: "ok", value: storeResult.value };
}

async function runPlanFeedbackFromSession(ctx: PrAddressExecContext, request: z.output<typeof planFeedbackParseSchema>, prNumber: number): Promise<ClinkrExit<unknown>> {
	const sessionInputs = await resolvePlanFeedbackSessionInputs({ ctx, prNumber, harnessSessionId: request.harness_session_id });
	if (sessionInputs.type === "error") return failure(sessionInputs.errorType, sessionInputs.message);
	const result = planFeedback({ manifest: sessionInputs.value.manifest, classification: sessionInputs.value.classification.classification });
	const resultWithResolvedInputs = { ...result, resolved_inputs: sessionInputs.value.resolvedInputs };
	if (!result.valid) return negative("PR feedback classification failed validation; no plan produced.", resultWithResolvedInputs);
	const planReference = await sessionInputs.value.store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber, kind: "plan" }),
		role: "summary",
		payload: resultWithResolvedInputs,
	});
	if (planReference.type === "error") return failure(planReference.errorType, planReference.message);
	return ok({ ...resultWithResolvedInputs, plan_reference: planReference.value });
}

async function loadValidatePayload(
	ctx: PrAddressExecContext,
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
	stdin: () => Promise<string>,
): Promise<OperationResult<ValidateFeedbackClassificationInput, string>> {
	const manifestSourceCount = Number(request.manifest_json !== undefined) + Number(request.manifest_file !== undefined);
	const classificationSourceCount = Number(request.classification_json !== undefined) + Number(request.classification_file !== undefined);
	const hasWrapperOptions = request.payload_json !== undefined || request.payload_file !== undefined;
	const hasSessionSource = request.pr_number !== undefined;
	// validate has a wrapper/split/session source matrix that does not fit resolveOperationInput's explicit/session shape.
	if (hasSessionSource) return await loadValidatePayloadFromSession(ctx, request, manifestSourceCount, classificationSourceCount, hasWrapperOptions, stdin);

	const hasSplitOptions = manifestSourceCount > 0 || classificationSourceCount > 0;
	if (!hasSplitOptions) return await loadValidateWrapperPayload(request, stdin);

	if (hasWrapperOptions) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "validate-feedback-classification cannot mix wrapper input (--payload-json/--payload-file) with split manifest/classification inputs.",
		};
	}
	if (manifestSourceCount !== 1 || classificationSourceCount !== 1) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "validate-feedback-classification split input requires exactly one manifest source (--manifest-json or --manifest-file) and exactly one classification source (--classification-json or --classification-file).",
		};
	}
	return await loadValidateSplitPayload(request, stdin);
}

async function loadValidatePayloadFromSession(
	ctx: PrAddressExecContext,
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
	manifestSourceCount: number,
	classificationSourceCount: number,
	hasWrapperOptions: boolean,
	stdin: () => Promise<string>,
): Promise<OperationResult<ValidateFeedbackClassificationInput, string>> {
	if (request.pr_number === undefined) throw new Error("validate-feedback-classification session source was selected without pr_number");
	if (hasWrapperOptions) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: validateSessionMixMessage(VALIDATE_WRAPPER_INPUT_DESCRIPTION),
		};
	}
	if (manifestSourceCount > 0) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: validateSessionMixMessage(VALIDATE_MANIFEST_INPUT_DESCRIPTION),
		};
	}
	if (classificationSourceCount !== 1) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "validate-feedback-classification session input requires exactly one classification source (--classification-json or --classification-file).",
		};
	}
	const classification = await loadJsonRecord({
		optionValue: request.classification_json,
		filePath: request.classification_file,
		canReadStdin: false,
		commandName: "validate-feedback-classification",
		inputDescription: "classification",
		optionName: "--classification-json",
		fileOptionName: "--classification-file",
		stdin,
	});
	if (classification.type === "error") return { type: "error", errorType: classification.error.errorType, message: classification.error.message };
	const manifest = await resolvePrManifestSessionInput({ ctx, prNumber: request.pr_number, harnessSessionId: request.harness_session_id });
	if (manifest.type === "error") return manifest;
	return {
		type: "ok",
		value: {
			source: "session",
			manifest: manifest.value.manifest,
			classification: classification.value,
			session: { prNumber: request.pr_number, store: manifest.value.store, resolvedInputs: { manifest: manifest.value.resolvedInput } },
		},
	};
}

async function loadValidateWrapperPayload(
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
	stdin: () => Promise<string>,
): Promise<OperationResult<ValidateFeedbackClassificationInput, string>> {
	const result = await loadJsonInput({
		optionValue: request.payload_json,
		filePath: request.payload_file,
		commandName: "validate-feedback-classification",
		inputDescription: "wrapper payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: wrapperPayloadSchema,
		stdin,
	});
	if (result.type === "error") return { type: "error", errorType: result.error.errorType, message: result.error.message };
	return { type: "ok", value: { source: "explicit", manifest: result.value.manifest, classification: result.value.classification } };
}

async function loadValidateSplitPayload(
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
	stdin: () => Promise<string>,
): Promise<OperationResult<ValidateFeedbackClassificationInput, string>> {
	const manifest = await loadJsonRecord({
		optionValue: request.manifest_json,
		filePath: request.manifest_file,
		canReadStdin: false,
		commandName: "validate-feedback-classification",
		inputDescription: "manifest",
		optionName: "--manifest-json",
		fileOptionName: "--manifest-file",
		stdin,
	});
	if (manifest.type === "error") return { type: "error", errorType: manifest.error.errorType, message: manifest.error.message };
	const classification = await loadJsonRecord({
		optionValue: request.classification_json,
		filePath: request.classification_file,
		canReadStdin: false,
		commandName: "validate-feedback-classification",
		inputDescription: "classification",
		optionName: "--classification-json",
		fileOptionName: "--classification-file",
		stdin,
	});
	if (classification.type === "error") return { type: "error", errorType: classification.error.errorType, message: classification.error.message };
	return { type: "ok", value: { source: "explicit", manifest: manifest.value, classification: classification.value } };
}
