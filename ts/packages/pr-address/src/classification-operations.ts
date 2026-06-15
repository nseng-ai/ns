import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";

import { buildFeedbackClassificationTemplate, planFeedback, validateFeedbackClassification, type FeedbackClassificationValidationResult } from "./classification.ts";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { loadJsonRecord } from "./json-input.ts";
import type { PayloadReference } from "./payload-store.ts";
import { prArtifactDescriptor } from "./session-artifacts.ts";
import {
	resolveExplicitOrSelectedSessionInput,
	resolvePlanFeedbackSessionInputs,
	resolvePrManifestSessionInput,
	resolveValidateFeedbackClassificationSessionInput,
	type OperationResult,
	type PlanFeedbackSessionInputs,
	type ValidateFeedbackClassificationSessionInput,
} from "./session-inputs.ts";
import { compactOperationResult } from "./stdout-mode.ts";

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
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => {
			const result = data as Record<string, unknown>;
			return {
				type: "ok",
				value: compactOperationResult({
					operation: "classification-template",
					counts: asRecord(result.counts),
					resolvedInputs: result.resolved_inputs,
					artifacts: { full_output: fullOutput },
					details: { pr_number: result.pr_number, classification_template: result.classification_template },
				}),
			};
		},
	},
});

const validateFeedbackClassificationParseSchema = z.object({
	pr_number: z.number().int(),
	classification_json: z.string().optional(),
	classification_file: z.string().optional(),
	harness_session_id: z.string().optional(),
});

export const validateFeedbackClassificationOperation = defineExecOperation({
	spec: {
		name: "validate-feedback-classification",
		description: "Validate a PR feedback classification packet against a compact payload manifest.",
		schema: validateFeedbackClassificationParseSchema,
		handler: runValidateFeedbackClassificationOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => compactValidateFeedbackClassificationResult(data, fullOutput),
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
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => compactPlanFeedbackResult(data, fullOutput),
	},
});

interface ClassificationTemplateInput {
	manifest: unknown;
	resolvedInputs?: { manifest: PayloadReference } | undefined;
}

interface PlanFeedbackInput {
	manifest: unknown;
	classification: unknown;
	storeInputs?: { sessionInputs: PlanFeedbackSessionInputs; prNumber: number } | undefined;
}

async function runClassificationTemplateOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof classificationTemplateParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const inputResult = await resolveExplicitOrSelectedSessionInput({
		commandName: "classification-template",
		explicitSource: {
			hasExplicitSource: request.manifest_json !== undefined || request.manifest_file !== undefined,
			description: "manifest input (--manifest-json, --manifest-file, or stdin)",
			resolve: async (stdin) => await loadClassificationTemplateExplicitInput(ctx, request, stdin),
		},
		sessionSource: {
			isSelected: request.pr_number !== undefined,
			description: "session resolution (--pr-number)",
			resolve: async () => await loadClassificationTemplateSessionInput(ctx, request),
		},
		stdin: { read: ctx.stdin },
		defaultSource: "explicit",
		mixInputMessage: "classification-template cannot mix session resolution (--pr-number) with manifest input (--manifest-json, --manifest-file, or stdin); pass exactly one input source.",
	});
	if (inputResult.type === "error") return failure(inputResult.errorType, inputResult.message);

	const input = inputResult.value.value;
	const result = buildFeedbackClassificationTemplate(input.manifest);
	if (result.type === "error") return failure("invalid_request", result.message);
	const data = input.resolvedInputs === undefined ? result.value : { ...result.value, resolved_inputs: input.resolvedInputs };
	return ok(data);
}


async function loadClassificationTemplateExplicitInput(
	ctx: PrAddressExecContext,
	request: z.output<typeof classificationTemplateParseSchema>,
	stdin: () => Promise<string>,
): Promise<OperationResult<ClassificationTemplateInput, string>> {
	const manifest = await loadJsonRecord({
		optionValue: request.manifest_json,
		filePath: request.manifest_file,
		commandName: "classification-template",
		inputDescription: "manifest JSON",
		optionName: "--manifest-json",
		fileOptionName: "--manifest-file",
		stdin,
	});
	if (manifest.type === "error") return { type: "error", errorType: manifest.error.errorType, message: manifest.error.message };
	return { type: "ok", value: { manifest: manifest.value } };
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
	const inputResult = await resolveValidateFeedbackClassificationSessionInput({
		ctx,
		prNumber: request.pr_number,
		classificationJson: request.classification_json,
		classificationFile: request.classification_file,
		harnessSessionId: request.harness_session_id,
	});
	if (inputResult.type === "error") return failure(inputResult.errorType, inputResult.message);

	const input = inputResult.value;
	const result = validateFeedbackClassification({ manifest: input.manifest, classification: input.classification });
	const resultWithResolvedInputs = { ...result, resolved_inputs: input.resolvedInputs };
	if (!result.valid) return negative("PR feedback classification failed validation.", resultWithResolvedInputs);

	const classificationReference = await persistValidatedClassification({ input, result });
	if (classificationReference.type === "error") return failure(classificationReference.errorType, classificationReference.message);
	const data = { ...resultWithResolvedInputs, classification_reference: classificationReference.value };
	return ok(data);
}

async function runPlanFeedbackOperation(ctx: PrAddressExecContext, request: z.output<typeof planFeedbackParseSchema>): Promise<ClinkrExit<unknown>> {
	const inputResult = await resolveExplicitOrSelectedSessionInput({
		commandName: "plan-feedback",
		explicitSource: {
			hasExplicitSource: request.payload_json !== undefined || request.payload_file !== undefined,
			description: "JSON payload (--payload-json, --payload-file, or stdin)",
			resolve: async (stdin) => await loadPlanFeedbackExplicitInput(request, stdin),
		},
		sessionSource: {
			isSelected: request.pr_number !== undefined,
			description: "session resolution (--pr-number)",
			resolve: async () => await loadPlanFeedbackSessionInput(ctx, request),
		},
		stdin: { read: ctx.stdin },
		defaultSource: "explicit",
		mixInputMessage: "plan-feedback cannot mix session resolution (--pr-number) with JSON payload input (--payload-json, --payload-file, or stdin); pass exactly one input source.",
	});
	if (inputResult.type === "error") return failure(inputResult.errorType, inputResult.message);
	const input = inputResult.value.value;
	if (input.storeInputs !== undefined) return await runPlanFeedbackFromSession(input.storeInputs.sessionInputs, input.storeInputs.prNumber);
	const result = planFeedback({ manifest: input.manifest, classification: input.classification });
	if (!result.valid) return negative("PR feedback classification failed validation; no plan produced.", result);
	return ok(result);
}

function compactValidateFeedbackClassificationResult(data: unknown, fullOutput: PayloadReference): OperationResult<Record<string, unknown>> {
	const result = data as Record<string, unknown> & { valid: boolean; counts?: unknown; errors?: readonly unknown[]; resolved_inputs?: unknown; classification_reference?: PayloadReference | undefined };
	const classificationReference = result.classification_reference ?? null;
	return {
		type: "ok",
		value: compactOperationResult({
			operation: "validate-feedback-classification",
			counts: asRecord(result.counts),
			errors: result.errors,
			resolvedInputs: result.resolved_inputs,
			artifacts: { full_output: fullOutput, produced: classificationReference === null ? [] : [{ kind: "classification", reference: classificationReference }] },
			details: { valid: result.valid, classification_reference: classificationReference },
		}),
	};
}

function compactPlanFeedbackResult(data: unknown, fullOutput: PayloadReference): OperationResult<Record<string, unknown>> {
	const result = data as Record<string, unknown> & { valid: boolean; counts?: unknown; errors?: readonly unknown[]; resolved_inputs?: unknown; summary?: unknown; plan_reference?: PayloadReference | undefined };
	const planReference = result.plan_reference ?? null;
	return {
		type: "ok",
		value: compactOperationResult({
			operation: "plan-feedback",
			counts: asRecord(result.counts),
			summary: asRecord(result.summary),
			errors: result.errors,
			resolvedInputs: result.resolved_inputs,
			artifacts: { full_output: fullOutput, produced: planReference === null ? [] : [{ kind: "plan", reference: planReference }] },
			details: { valid: result.valid, plan_reference: planReference },
		}),
	};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

async function persistValidatedClassification(options: {
	input: ValidateFeedbackClassificationSessionInput;
	result: FeedbackClassificationValidationResult;
}): Promise<OperationResult<PayloadReference>> {
	if (options.result.pr_number === null) {
		return { type: "error", errorType: "invalid_request", message: "validate-feedback-classification cannot persist a PR-scoped classification without a PR number." };
	}
	const artifact = { pr_number: options.result.pr_number, classification: options.input.classification, validation: options.result };
	const reference = await options.input.store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber: options.result.pr_number, kind: "classification" }),
		role: "summary",
		payload: artifact,
	});
	if (reference.type === "error") return reference;
	return { type: "ok", value: reference.value };
}

async function loadPlanFeedbackExplicitInput(
	request: z.output<typeof planFeedbackParseSchema>,
	stdin: () => Promise<string>,
): Promise<OperationResult<PlanFeedbackInput, string>> {
	const payload = await loadJsonRecord({
		optionValue: request.payload_json,
		filePath: request.payload_file,
		commandName: "plan-feedback",
		inputDescription: "JSON payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		stdin,
	});
	if (payload.type === "error") return { type: "error", errorType: payload.error.errorType, message: payload.error.message };
	return { type: "ok", value: { manifest: payload.value.manifest, classification: payload.value.classification } };
}

async function loadPlanFeedbackSessionInput(
	ctx: PrAddressExecContext,
	request: z.output<typeof planFeedbackParseSchema>,
): Promise<OperationResult<PlanFeedbackInput, string>> {
	if (request.pr_number === undefined) throw new Error("plan-feedback session source was selected without pr_number");
	const sessionInputs = await resolvePlanFeedbackSessionInputs({ ctx, prNumber: request.pr_number, harnessSessionId: request.harness_session_id });
	if (sessionInputs.type === "error") return sessionInputs;
	return { type: "ok", value: { manifest: sessionInputs.value.manifest, classification: sessionInputs.value.classification.classification, storeInputs: { sessionInputs: sessionInputs.value, prNumber: request.pr_number } } };
}

async function runPlanFeedbackFromSession(sessionInputs: PlanFeedbackSessionInputs, prNumber: number): Promise<ClinkrExit<unknown>> {
	const result = planFeedback({ manifest: sessionInputs.manifest, classification: sessionInputs.classification.classification });
	const resultWithResolvedInputs = { ...result, resolved_inputs: sessionInputs.resolvedInputs };
	if (!result.valid) return negative("PR feedback classification failed validation; no plan produced.", resultWithResolvedInputs);
	const planReference = await sessionInputs.store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber, kind: "plan" }),
		role: "summary",
		payload: resultWithResolvedInputs,
	});
	if (planReference.type === "error") return failure(planReference.errorType, planReference.message);
	const data = { ...resultWithResolvedInputs, plan_reference: planReference.value };
	return ok(data);
}
