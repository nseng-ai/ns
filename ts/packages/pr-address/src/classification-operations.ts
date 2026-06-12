import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";

import { buildFeedbackClassificationTemplate } from "./classification-packet.ts";
import { planFeedback } from "./classification-planning.ts";
import { validateFeedbackClassification } from "./classification-validation.ts";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { loadJsonInput, readJsonInputText } from "./json-input.ts";
import { isRecord } from "./operation-support.ts";

const wrapperPayloadSchema = z.looseObject({
	manifest: z.unknown(),
	classification: z.unknown(),
});

type WrapperPayload = z.infer<typeof wrapperPayloadSchema>;

const classificationTemplateParseSchema = z.object({
	manifest_json: z.string().optional(),
	manifest_file: z.string().optional(),
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
});

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
});

export const planFeedbackOperation = defineExecOperation({
	spec: {
		name: "plan-feedback",
		description: "Plan deterministic PR feedback execution batches from a validated classification packet.",
		schema: planFeedbackParseSchema,
		handler: runPlanFeedbackOperation,
	},
});

async function runClassificationTemplateOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof classificationTemplateParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const manifestResult = await loadJsonObjectSource({
		inlineJson: request.manifest_json,
		filePath: request.manifest_file,
		canReadStdin: true,
		commandName: "classification-template",
		inputName: "compact manifest",
		inlineOption: "--manifest-json",
		fileOption: "--manifest-file",
		stdin: ctx.stdin,
	});
	if (manifestResult.type === "error") return failure(manifestResult.errorType, manifestResult.message);

	const result = buildFeedbackClassificationTemplate(manifestResult.value);
	if (result.type === "error") return failure("invalid_request", result.message);
	return ok(result.value);
}

async function runValidateFeedbackClassificationOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadValidatePayload(request, ctx.stdin);
	if (payloadResult.type === "error") return failure(payloadResult.errorType, payloadResult.message);

	const result = validateFeedbackClassification({ manifest: payloadResult.value.manifest, classification: payloadResult.value.classification });
	if (result.valid) return ok(result);
	return negative("PR feedback classification failed validation.", result);
}

async function runPlanFeedbackOperation(ctx: PrAddressExecContext, request: z.output<typeof planFeedbackParseSchema>): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.payload_json,
		filePath: request.payload_file,
		commandName: "plan-feedback",
		inputDescription: "JSON payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: wrapperPayloadSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);

	const result = planFeedback({ manifest: payloadResult.value.manifest, classification: payloadResult.value.classification });
	if (result.valid) return ok(result);
	return negative("PR feedback classification failed validation; no plan produced.", result);
}

async function loadValidatePayload(
	request: z.output<typeof validateFeedbackClassificationParseSchema>,
	stdin: () => Promise<string>,
): Promise<LoadPayloadResult<WrapperPayload>> {
	const hasSplitOptions = [request.manifest_json, request.manifest_file, request.classification_json, request.classification_file].some(
		(value) => value !== undefined,
	);
	if (!hasSplitOptions) {
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
		return { type: "ok", value: result.value };
	}

	if (request.payload_json !== undefined || request.payload_file !== undefined) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "validate-feedback-classification cannot mix wrapper input (--payload-json/--payload-file) with split manifest/classification inputs.",
		};
	}
	const manifestSourceCount = Number(request.manifest_json !== undefined) + Number(request.manifest_file !== undefined);
	const classificationSourceCount = Number(request.classification_json !== undefined) + Number(request.classification_file !== undefined);
	if (manifestSourceCount !== 1 || classificationSourceCount !== 1) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "validate-feedback-classification split input requires exactly one manifest source (--manifest-json or --manifest-file) and exactly one classification source (--classification-json or --classification-file).",
		};
	}
	const manifest = await loadJsonObjectSource({
		inlineJson: request.manifest_json,
		filePath: request.manifest_file,
		canReadStdin: false,
		commandName: "validate-feedback-classification",
		inputName: "manifest",
		inlineOption: "--manifest-json",
		fileOption: "--manifest-file",
		stdin,
	});
	if (manifest.type === "error") return manifest;
	const classification = await loadJsonObjectSource({
		inlineJson: request.classification_json,
		filePath: request.classification_file,
		canReadStdin: false,
		commandName: "validate-feedback-classification",
		inputName: "classification",
		inlineOption: "--classification-json",
		fileOption: "--classification-file",
		stdin,
	});
	if (classification.type === "error") return classification;
	return { type: "ok", value: { manifest: manifest.value, classification: classification.value } };
}

interface LoadPayloadOk<T> {
	type: "ok";
	value: T;
}

interface LoadPayloadError {
	type: "error";
	errorType: "invalid_json" | "invalid_request";
	message: string;
}

type LoadPayloadResult<T> = LoadPayloadOk<T> | LoadPayloadError;

async function loadJsonObjectSource(options: {
	inlineJson: string | undefined;
	filePath: string | undefined;
	canReadStdin: boolean;
	commandName: string;
	inputName: string;
	inlineOption: string;
	fileOption: string;
	stdin: () => Promise<string>;
}): Promise<LoadPayloadResult<Record<string, unknown>>> {
	const textResult = await readJsonInputText({
		optionValue: options.inlineJson,
		filePath: options.filePath,
		canReadStdin: options.canReadStdin,
		commandName: options.commandName,
		inputDescription: options.inputName,
		optionName: options.inlineOption,
		fileOptionName: options.fileOption,
		stdin: options.stdin,
	});
	if (textResult.type === "error") return { type: "error", errorType: textResult.error.errorType, message: textResult.error.message };

	let parsed: unknown;
	try {
		parsed = JSON.parse(textResult.value);
	} catch (error) {
		return { type: "error", errorType: "invalid_json", message: `Invalid ${options.commandName} ${options.inputName}: ${jsonParseMessage(error)}` };
	}
	if (!isRecord(parsed)) {
		return { type: "error", errorType: "invalid_request", message: `${options.commandName} ${options.inputName} JSON must be an object.` };
	}
	return { type: "ok", value: parsed };
}

function jsonParseMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
