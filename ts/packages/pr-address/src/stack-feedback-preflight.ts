import { failure, negative, ok } from "@asdl/clinkr";

import { branchesValidationMessage, mapBranchesToOpenPrs, mapBranchPrsInputSchema, type MapBranchPrsResult } from "./map-branch-prs.ts";
import { loadJsonInput } from "./json-input.ts";
import { githubGateway, parseReadOptions } from "./operation-support.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";
import { PayloadStore, type PayloadReference } from "./payload-store.ts";
import {
	compactPrepResult,
	prepareStackFeedbackStack,
	type StackFeedbackPrInput,
	type StackFeedbackPrepCompactPrResult,
	type StackFeedbackPrepCompactResult,
	type StackFeedbackPrepResult,
} from "./stack-feedback-prep-core.ts";

const STDOUT_MODES = new Set(["full", "compact"]);

interface FrozenStackArtifact {
	stack: StackFeedbackPrInput[];
}

interface StackFeedbackPreflightFullResult extends StackFeedbackPrepResult {
	mapping_summary: MapBranchPrsResult["summary"];
	stack_reference: PayloadReference;
}

interface StackFeedbackPreflightCompactResult {
	payload_session_id: string;
	mapping_summary: MapBranchPrsResult["summary"];
	stack_reference: PayloadReference;
	stack_summary_reference: PayloadReference;
	summary: StackFeedbackPrepCompactResult["summary"];
	stack: StackFeedbackPrepCompactPrResult[];
	zero_feedback_prs: Array<{ pr_number: number; branch: string }>;
}

export async function runStackFeedbackPreflightOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseReadOptions(invocation.args, ["--branches-json", "--payload-session-id", "--stdout-mode"], []);
	if (parsed.type === "error") return exitFailure("invalid_request", parsed.message);
	const unexpectedPositional = parsed.options.positionals[0];
	if (unexpectedPositional !== undefined) return exitFailure("invalid_request", `Unexpected argument for stack-feedback-preflight: ${unexpectedPositional}`);
	const stdoutMode = parsed.options.values.get("--stdout-mode") ?? "full";
	if (!STDOUT_MODES.has(stdoutMode)) return { type: "fallback" };

	const storeResult = await PayloadStore.fromEnvironment({
		explicitSessionId: parsed.options.values.get("--payload-session-id") ?? null,
		env: invocation.deps.env,
		clock: invocation.deps.context.payloadClock,
	});
	if (storeResult.type === "error") return exitFailure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await loadJsonInput({
		optionValue: parsed.options.values.get("--branches-json"),
		commandName: "stack-feedback-preflight",
		inputDescription: "branches JSON payload",
		optionName: "--branches-json",
		schema: mapBranchPrsInputSchema,
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return exitFailure(payloadResult.error.errorType, payloadResult.error.message);

	const branches = payloadResult.value.branches;
	const validationMessage = branchesValidationMessage(branches, "stack-feedback-preflight");
	if (validationMessage !== null) return exitFailure("invalid_request", validationMessage);

	const github = githubGateway(invocation);
	if (github.type === "error") return github.result;
	const mapping = await mapBranchesToOpenPrs({ branches, github: github.gateway, invocation });
	if (mapping.type === "error") return mapping.result;
	if (mapping.value.missing_branches.length > 0) return missingBranchesResult(mapping.value);

	const frozenStack: FrozenStackArtifact = { stack: mapping.value.branch_prs.map(stackEntry) };
	const stackReference = await store.writeJsonArtifact({ descriptor: "pr-address-stack-feedback-preflight", role: "summary", payload: frozenStack });
	if (stackReference.type === "error") return exitFailure(stackReference.errorType, stackReference.message);

	const prepared = await prepareStackFeedbackStack({
		invocation,
		store,
		stack: frozenStack.stack,
		github: github.gateway,
		shouldIncludeResolved: false,
		shouldIncludeEmptyReviews: false,
	});
	if (prepared.type === "error") return prepared.result;

	const fullResult: StackFeedbackPreflightFullResult = {
		...prepared.value.result,
		mapping_summary: mapping.value.summary,
		stack_reference: stackReference.value,
	};
	if (stdoutMode === "compact") return { type: "exit", exit: ok(compactPreflightResult(fullResult, prepared.value.stackSummaryReference)) };
	return { type: "exit", exit: ok(fullResult) };
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

function missingBranchesResult(mapping: MapBranchPrsResult): ExecOperationDispatchResult {
	return { type: "exit", exit: negative(`No open PR found for branches: ${mapping.missing_branches.join(", ")}`, mapping) };
}

function compactPreflightResult(result: StackFeedbackPreflightFullResult, stackSummaryReference: PayloadReference): StackFeedbackPreflightCompactResult {
	const compact = compactPrepResult(result, stackSummaryReference);
	return {
		payload_session_id: compact.payload_session_id,
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

function exitFailure(errorType: string, message: string): ExecOperationDispatchResult {
	return { type: "exit", exit: failure(errorType, message) };
}
