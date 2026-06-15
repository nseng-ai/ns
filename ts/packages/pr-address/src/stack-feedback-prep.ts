import { z } from "zod";

import { failure, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { compactOperationResult, stdoutModeSchema } from "./stdout-mode.ts";
import { loadArtifactReference, loadJsonInput, type JsonInputResult } from "./json-input.ts";
import type { PayloadArtifactStore } from "./payload-store.ts";
import { stackFeedbackPrepInputSchema, type StackFeedbackPrInput } from "./stack-feedback-prep-contracts.ts";
import { compactPrepResult, prepareStackFeedbackStack } from "./stack-feedback-prep-core.ts";

const stackFeedbackPrepParseSchema = z.object({
	stack_json: z.string().optional(),
	stack_reference: z.string().optional(),
	harness_session_id: z.string().optional(),
	stdout_mode: stdoutModeSchema,
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
	const storeResult = await ctx.context.payloadStoreFactory.fromEnvironment({
		explicitHarnessSessionId: request.harness_session_id ?? null,
		env: ctx.env,
		clock: ctx.context.payloadClock,
	});
	if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await resolvePrepStackInput({
		stackJson: request.stack_json,
		stackReference: request.stack_reference,
		stdin: ctx.stdin,
		store,
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
	if (request.stdout_mode === "compact") {
		const compact = compactPrepResult(result, stackSummaryReference);
		return ok(
			compactOperationResult({
				operation: "stack-feedback-prep",
				counts: { ...compact.summary },
				artifacts: { produced: [{ kind: "stack-prep", reference: stackSummaryReference }] },
				details: { harness_session_id: compact.harness_session_id, stack: compact.stack },
			}),
		);
	}
	return ok(result);
}

async function resolvePrepStackInput(options: {
	stackJson: string | undefined;
	stackReference: string | undefined;
	stdin: () => Promise<string>;
	store: PayloadArtifactStore;
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
		store: options.store,
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


function duplicateValues<T>(values: readonly T[]): T[] {
	const counts = new Map<T, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	const seen = new Set<T>();
	const duplicates: T[] = [];
	for (const value of values) {
		if ((counts.get(value) ?? 0) > 1 && !seen.has(value)) {
			duplicates.push(value);
			seen.add(value);
		}
	}
	return duplicates;
}

function pythonRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function pythonTupleRepr(values: ReadonlyArray<string | number>): string {
	const parts = values.map((value) => (typeof value === "number" ? String(value) : pythonRepr(value)));
	if (parts.length === 1) return `(${parts[0]},)`;
	return `(${parts.join(", ")})`;
}
