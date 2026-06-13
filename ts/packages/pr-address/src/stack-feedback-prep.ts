import { z } from "zod";

import { failure, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { loadArtifactReference, loadJsonInput, type JsonInputResult } from "./json-input.ts";
import { PayloadStore } from "./payload-store.ts";
import { compactPrepResult, prepareStackFeedbackStack } from "./stack-feedback-prep-core.ts";
import { stackFeedbackPrepInputSchema, type StackFeedbackPrInput } from "./stack-feedback-contracts.ts";
import { duplicateValues, pythonTupleRepr } from "./string-values.ts";

const stackFeedbackPrepParseSchema = z.object({
	stack_json: z.string().optional(),
	stack_reference: z.string().optional(),
	payload_session_id: z.string().optional(),
	stdout_mode: z.enum(["full", "compact"]).default("full"),
	include_resolved: z.boolean().default(false),
	include_empty_reviews: z.boolean().default(false),
});

export const stackFeedbackPrepOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "stack-feedback-prep",
		description: "Fetch stack PR feedback, write payload artifacts, and build classification templates.",
		schema: stackFeedbackPrepParseSchema,
		handler: runStackFeedbackPrepOperation,
	},
});

async function runStackFeedbackPrepOperation(ctx: PrAddressExecContext, request: z.output<typeof stackFeedbackPrepParseSchema>): Promise<ClinkrExit<unknown>> {
	// Python opens the payload store before reading the stack JSON; preserve that ordering.
	const storeResult = await PayloadStore.fromEnvironment({
		explicitSessionId: request.payload_session_id ?? null,
		env: ctx.env,
		clock: ctx.context.payloadClock,
	});
	if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await resolvePrepStackInput({
		stackJson: request.stack_json,
		stackReference: request.stack_reference,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);

	const validationMessage = stackInputValidationMessage(payloadResult.value.stack);
	if (validationMessage !== null) return failure("invalid_request", validationMessage);

	const prepared = await prepareStackFeedbackStack({
		ctx,
		store,
		stack: payloadResult.value.stack,
		github: ctx.context.github,
		shouldIncludeResolved: request.include_resolved,
		shouldIncludeEmptyReviews: request.include_empty_reviews,
	});
	if (prepared.type === "error") return prepared.exit;

	const { result, stackSummaryReference } = prepared.value;
	if (request.stdout_mode === "compact") return ok(compactPrepResult(result, stackSummaryReference));
	return ok(result);
}

async function resolvePrepStackInput(options: {
	stackJson: string | undefined;
	stackReference: string | undefined;
	stdin: () => Promise<string>;
}): Promise<JsonInputResult<{ stack: StackFeedbackPrInput[] }>> {
	if (options.stackReference === undefined) {
		return await loadJsonInput({
			optionValue: options.stackJson,
			commandName: "stack-feedback-prep",
			inputDescription: "stack JSON payload",
			optionName: "--stack-json",
			schema: stackFeedbackPrepInputSchema,
			stdin: options.stdin,
		});
	}
	if (options.stackJson !== undefined) {
		return {
			type: "error",
			error: { errorType: "invalid_request", message: "stack-feedback-prep cannot mix --stack-json with --stack-reference; pass exactly one stack source." },
		};
	}
	return await loadArtifactReference({
		filePath: options.stackReference,
		commandName: "stack-feedback-prep",
		optionName: "--stack-reference",
		artifactDescription: "a stack JSON payload",
		schema: stackFeedbackPrepInputSchema,
	});
}

function stackInputValidationMessage(stack: readonly StackFeedbackPrInput[]): string | null {
	if (stack.length === 0) return "stack-feedback-prep requires at least one stack PR.";
	const duplicatePrs = duplicateValues(stack.map((item) => item.pr_number));
	if (duplicatePrs.length > 0) return `stack-feedback-prep stack contains duplicate PR numbers: ${pythonTupleRepr(duplicatePrs)}`;
	if (!stack.every((item) => item.branch.trim() !== "")) return "stack-feedback-prep requires every stack PR branch to be non-empty.";
	const duplicateBranches = duplicateValues(stack.map((item) => item.branch));
	if (duplicateBranches.length > 0) return `stack-feedback-prep stack contains duplicate branches: ${pythonTupleRepr(duplicateBranches)}`;
	return null;
}

