import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { collectBranchPrChecks, type BranchPrChecksCollection } from "./core/branch-pr-checks.ts";
import { branchPrMappingGapsMessage, hasBranchPrMappingGaps } from "./core/branch-pr-mapping.ts";
import {
	defineExecOperation,
	gatewayOptions,
	prFeedbackFailureExit,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import { loadJsonInput } from "@nseng-ai/capability-kit/json-input";
import { branchesValidationMessage } from "./map-branch-prs.ts";
import { branchPrChecksResultSchema } from "./operation-schemas/collection.ts";

export const branchPrChecksInputSchema = z.looseObject({
	branches: z.array(z.string()),
});

const branchPrChecksParseSchema = z.object({
	branchesJson: z.string().optional(),
});

type BranchPrChecksRequest = z.output<typeof branchPrChecksParseSchema>;

export type BranchPrChecksOpResult = z.output<typeof branchPrChecksResultSchema>;

export const branchPrChecksOperation = defineExecOperation({
	isRepoContextRequired: true,
	resultSchema: branchPrChecksResultSchema,
	spec: {
		name: "branch-pr-checks",
		description: "Return open PRs and normalized checks for branches in one batched GitHub query.",
		schema: branchPrChecksParseSchema,
		handler: runBranchPrChecksOperation,
	},
});

async function runBranchPrChecksOperation(
	ctx: PrAddressExecContext,
	request: BranchPrChecksRequest,
): Promise<ClinkrExit<BranchPrChecksCollection>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.branchesJson,
		commandName: "branch-pr-checks",
		inputDescription: "branches JSON payload",
		optionName: "--branches-json",
		schema: branchPrChecksInputSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error")
		return failure(payloadResult.error.errorType, payloadResult.error.message);

	const branches = payloadResult.value.branches;
	const validationMessage = branchesValidationMessage(branches, "branch-pr-checks");
	if (validationMessage !== null) return failure("invalid-request", validationMessage);

	const result = await collectBranchPrChecks({
		branches,
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
	});
	if (result.type === "failure") return prFeedbackFailureExit(result.message, result.failure);
	const collection = result.collection;
	const gaps = branchPrChecksMappingGaps(collection);
	if (!hasBranchPrMappingGaps(gaps)) return ok(collection);
	return negative(branchPrMappingGapsMessage(gaps), { data: collection });
}

function branchPrChecksMappingGaps(collection: BranchPrChecksCollection) {
	return {
		missingBranches: collection.entries
			.filter((entry) => entry.status === "missing")
			.map((entry) => entry.branch),
		ambiguousBranchNames: collection.entries
			.filter((entry) => entry.status === "ambiguous")
			.map((entry) => entry.branch),
	};
}
