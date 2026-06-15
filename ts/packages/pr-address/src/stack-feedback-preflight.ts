import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { z } from "zod";

import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { compactOperationResult } from "./stdout-mode.ts";
import { loadJsonInput } from "./json-input.ts";
import { branchesValidationMessage, mapBranchesToOpenPrs, mapBranchPrsInputSchema, type MapBranchPrsResult } from "./map-branch-prs.ts";
import type { PayloadReference } from "./payload-store.ts";
import {
	type StackFeedbackPrInput,
	type StackFeedbackPrepCompactPrResult,
	type StackFeedbackPrepCompactResult,
	type StackFeedbackPrepResult,
} from "./stack-feedback-prep-contracts.ts";
import { compactPrepResult, prepareStackFeedbackStack } from "./stack-feedback-prep-core.ts";

interface FrozenStackArtifact {
	stack: StackFeedbackPrInput[];
}

interface StackFeedbackPreflightFullResult extends StackFeedbackPrepResult {
	mapping_summary: MapBranchPrsResult["summary"];
	stack_reference: PayloadReference;
}

interface StackFeedbackPreflightCompactResult {
	harness_session_id: string;
	mapping_summary: MapBranchPrsResult["summary"];
	stack_reference: PayloadReference;
	stack_summary_reference: PayloadReference;
	summary: StackFeedbackPrepCompactResult["summary"];
	stack: StackFeedbackPrepCompactPrResult[];
	zero_feedback_prs: Array<{ pr_number: number; branch: string }>;
}

const stackFeedbackPreflightParseSchema = z.object({
	branches_json: z.string().optional(),
	harness_session_id: z.string().optional(),
});

export const stackFeedbackPreflightOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "stack-feedback-preflight",
		description: "Map branches to open PRs, freeze the stack, and prepare stack feedback in one pass.",
		schema: stackFeedbackPreflightParseSchema,
		handler: runStackFeedbackPreflightOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => {
			if (isMapBranchPrsResult(data)) {
				return {
					type: "ok",
					value: compactOperationResult({
						operation: "stack-feedback-preflight",
						counts: data.summary,
						artifacts: { full_output: fullOutput },
						details: { branch_prs: data.branch_prs, missing_branches: data.missing_branches },
					}),
				};
			}
			const result = data as StackFeedbackPreflightFullResult;
			if (result.stack_summary_reference === null) return { type: "error", errorType: "payload_lookup_failed", message: "stack-feedback-preflight compact output requires a stack summary reference." };
			const compact = compactPreflightResult(result, result.stack_summary_reference);
			return {
				type: "ok",
				value: compactOperationResult({
					operation: "stack-feedback-preflight",
					counts: { ...compact.summary },
					artifacts: {
						full_output: fullOutput,
						produced: [
							{ kind: "stack", reference: compact.stack_reference },
							{ kind: "stack-prep", reference: compact.stack_summary_reference },
						],
					},
					details: { ...compact },
				}),
			};
		},
	},
});

async function runStackFeedbackPreflightOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof stackFeedbackPreflightParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const storeResult = await ctx.context.payloadStoreFactory.fromEnvironment({
		explicitHarnessSessionId: request.harness_session_id ?? null,
		env: ctx.env,
		clock: ctx.context.payloadClock,
	});
	if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await loadJsonInput({
		optionValue: request.branches_json,
		commandName: "stack-feedback-preflight",
		inputDescription: "branches JSON payload",
		optionName: "--branches-json",
		schema: mapBranchPrsInputSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);

	const branches = payloadResult.value.branches;
	const validationMessage = branchesValidationMessage(branches, "stack-feedback-preflight");
	if (validationMessage !== null) return failure("invalid_request", validationMessage);

	const github = ctx.context.github;
	const mapping = await mapBranchesToOpenPrs({ branches, github, ctx });
	if (mapping.type === "error") return mapping.exit;
	if (mapping.value.missing_branches.length > 0) return missingBranchesResult(mapping.value);

	const frozenStack: FrozenStackArtifact = { stack: mapping.value.branch_prs.map(stackEntry) };
	const stackReference = await store.writeJsonArtifact({ descriptor: "pr-address-stack-feedback-preflight", role: "summary", payload: frozenStack });
	if (stackReference.type === "error") return failure(stackReference.errorType, stackReference.message);

	const prepared = await prepareStackFeedbackStack({
		ctx,
		store,
		stack: frozenStack.stack,
		github,
		shouldIncludeResolved: false,
		shouldIncludeEmptyReviews: false,
	});
	if (prepared.type === "error") return prepared.exit;

	const fullResult: StackFeedbackPreflightFullResult = {
		...prepared.value.result,
		mapping_summary: mapping.value.summary,
		stack_reference: stackReference.value,
	};
	return ok(fullResult);
}

function isMapBranchPrsResult(value: unknown): value is MapBranchPrsResult {
	return typeof value === "object" && value !== null && "branch_prs" in value && "missing_branches" in value && "summary" in value;
}

function stackEntry(entry: MapBranchPrsResult["branch_prs"][number]): StackFeedbackPrInput {
	return {
		pr_number: entry.pr_number,
		branch: entry.branch,
		title: entry.title,
		url: entry.url,
		head_ref_name: entry.head_ref_name,
		base_ref_name: entry.base_ref_name,
	};
}

function missingBranchesResult(mapping: MapBranchPrsResult): ClinkrExit<unknown> {
	return negative(`No open PR found for branches: ${mapping.missing_branches.join(", ")}`, mapping);
}

function compactPreflightResult(result: StackFeedbackPreflightFullResult, stackSummaryReference: PayloadReference): StackFeedbackPreflightCompactResult {
	const compact = compactPrepResult(result, stackSummaryReference);
	return {
		harness_session_id: compact.harness_session_id,
		mapping_summary: result.mapping_summary,
		stack_reference: result.stack_reference,
		stack_summary_reference: compact.stack_summary_reference,
		summary: compact.summary,
		stack: compact.stack.filter(hasFeedback),
		zero_feedback_prs: compact.stack.filter((item) => !hasFeedback(item)).map((item) => ({ pr_number: item.pr_number, branch: item.branch })),
	};
}

function hasFeedback(item: StackFeedbackPrepCompactPrResult): boolean {
	return item.counts.reviews + item.counts.review_threads + item.counts.unresolved_review_threads + item.counts.discussion_comments > 0;
}
