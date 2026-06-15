import { isAbsolute, relative, resolve, sep } from "node:path";

import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";

import { buildFeedbackClassificationTemplate, planFeedback, validateFeedbackClassification, type FeedbackClassificationValidationResult } from "./classification.ts";
import { defineExecOperation, gatewayFailureMessage, type PrAddressExecContext } from "./exec-operation.ts";
import { loadJsonRecord } from "./json-input.ts";
import type { PayloadArtifactStore, PayloadReference } from "./payload-store.ts";
import { prArtifactDescriptor } from "./session-artifacts.ts";
import { rejectNonEmptyStdin, resolvePlanFeedbackSessionInputs, resolvePrManifestSessionInput, type OperationResult } from "./session-inputs.ts";
import { compactOperationResult } from "./stdout-mode.ts";

const classificationTemplateParseSchema = z.object({
	pr_number: z.number().int(),
	harness_session_id: z.string().optional(),
});

export const classificationTemplateOperation = defineExecOperation({
	spec: {
		name: "classification-template",
		description: "Build a deterministic classification scaffold from the payload-session manifest for a PR.",
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
	pr_number: z.number().int(),
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

async function runClassificationTemplateOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof classificationTemplateParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const stdinResult = await rejectNonEmptyStdin({ commandName: "classification-template", stdin: ctx.stdin });
	if (stdinResult.type === "error") return failure(stdinResult.errorType, stdinResult.message);
	const inputResult = await loadClassificationTemplateSessionInput(ctx, request);
	if (inputResult.type === "error") return failure(inputResult.errorType, inputResult.message);

	const input = inputResult.value;
	const result = buildFeedbackClassificationTemplate(input.manifest);
	if (result.type === "error") return failure("invalid_request", result.message);
	const data = input.resolvedInputs === undefined ? result.value : { ...result.value, resolved_inputs: input.resolvedInputs };
	return ok(data);
}

async function loadClassificationTemplateSessionInput(
	ctx: PrAddressExecContext,
	request: z.output<typeof classificationTemplateParseSchema>,
): Promise<OperationResult<ClassificationTemplateInput, string>> {
	const sessionInput = await resolvePrManifestSessionInput({ ctx, prNumber: request.pr_number, harnessSessionId: request.harness_session_id });
	if (sessionInput.type === "error") return sessionInput;
	return { type: "ok", value: { manifest: sessionInput.value.manifest, resolvedInputs: { manifest: sessionInput.value.resolvedInput } } };
}

async function runValidateFeedbackClassificationOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const inputResult = await loadValidateSessionInput(ctx, request);
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
	const stdinResult = await rejectNonEmptyStdin({ commandName: "plan-feedback", stdin: ctx.stdin });
	if (stdinResult.type === "error") return failure(stdinResult.errorType, stdinResult.message);
	return await runPlanFeedbackFromSession(ctx, request, request.pr_number);
}

interface ValidateFeedbackClassificationInput {
	manifest: unknown;
	classification: unknown;
	prNumber: number;
	store: PayloadArtifactStore;
	resolvedInputs: { manifest: PayloadReference };
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
	input: ValidateFeedbackClassificationInput;
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
	const data = { ...resultWithResolvedInputs, plan_reference: planReference.value };
	return ok(data);
}

async function loadValidateSessionInput(
	ctx: PrAddressExecContext,
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
): Promise<OperationResult<ValidateFeedbackClassificationInput, string>> {
	const classificationSourceCount = Number(request.classification_json !== undefined) + Number(request.classification_file !== undefined);
	if (classificationSourceCount > 1) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "validate-feedback-classification accepts only one classification source; do not pass both --classification-json and --classification-file.",
		};
	}
	if (request.classification_file !== undefined) {
		const fileLocation = await validateClassificationFileLocation(ctx, request.classification_file);
		if (fileLocation.type === "error") return fileLocation;
	}
	const classification = await loadJsonRecord({
		optionValue: request.classification_json,
		filePath: request.classification_file,
		commandName: "validate-feedback-classification",
		inputDescription: "classification",
		optionName: "--classification-json",
		fileOptionName: "--classification-file",
		stdin: ctx.stdin,
	});
	if (classification.type === "error") return { type: "error", errorType: classification.error.errorType, message: classification.error.message };
	const manifest = await resolvePrManifestSessionInput({ ctx, prNumber: request.pr_number, harnessSessionId: request.harness_session_id });
	if (manifest.type === "error") return manifest;
	return {
		type: "ok",
		value: {
			manifest: manifest.value.manifest,
			classification: classification.value,
			prNumber: request.pr_number,
			store: manifest.value.store,
			resolvedInputs: { manifest: manifest.value.resolvedInput },
		},
	};
}

async function validateClassificationFileLocation(ctx: PrAddressExecContext, classificationFile: string): Promise<OperationResult<null, string>> {
	const classificationPath = resolve(ctx.cwd, classificationFile);
	const workTreeRoot = await ctx.context.git.getWorkTreeRoot({ cwd: ctx.cwd, env: ctx.env });
	if (workTreeRoot.type === "outside") return { type: "ok", value: null };
	if (workTreeRoot.type === "failure") {
		return {
			type: "error",
			errorType: "pr_gateway_failure",
			message: gatewayFailureMessage("Failed to resolve current git worktree root for validate-feedback-classification --classification-file safety guard", workTreeRoot.failure),
		};
	}
	const rootPath = resolve(workTreeRoot.root);
	if (!isPathInsideOrEqual(rootPath, classificationPath)) return { type: "ok", value: null };
	return {
		type: "error",
		errorType: "invalid_request",
		message: `validate-feedback-classification refuses --classification-file paths inside the current git worktree: ${classificationPath}. Pass classification JSON on stdin or via --classification-json, or use a file outside the worktree.`,
	};
}

function isPathInsideOrEqual(parent: string, candidate: string): boolean {
	const rel = relative(parent, candidate);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
