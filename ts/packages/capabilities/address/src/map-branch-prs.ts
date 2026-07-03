import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@ns/clinkr";
import { mapBranchesToOpenPrs } from "./core/branch-pr-mapping.ts";
import { nonEmptyStringCollectionValidationMessage } from "./string-collection-validation.ts";
import {
	defineExecOperation,
	gatewayOptions,
	prFeedbackFailureExit,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import { loadJsonInput } from "./json-input.ts";
import { mapBranchPrsResultSchema } from "./operation-schemas/collection.ts";

export const mapBranchPrsInputSchema = z.looseObject({
	branches: z.array(z.string()),
});

const mapBranchPrsParseSchema = z.object({
	branchesJson: z.string().optional(),
});

type MapBranchPrsRequest = z.output<typeof mapBranchPrsParseSchema>;

export type MapBranchPrsResult = z.output<typeof mapBranchPrsResultSchema>;
export type BranchPrEntry = MapBranchPrsResult["branchPrs"][number];
export type AmbiguousBranchPrEntry = MapBranchPrsResult["ambiguousBranches"][number];

export const mapBranchPrsOperation = defineExecOperation({
	isRepoContextRequired: true,
	resultSchema: mapBranchPrsResultSchema,
	spec: {
		name: "map-branch-prs",
		description: "Map local branches to open PRs.",
		schema: mapBranchPrsParseSchema,
		handler: runMapBranchPrsOperation,
	},
});

async function runMapBranchPrsOperation(
	ctx: PrAddressExecContext,
	request: MapBranchPrsRequest,
): Promise<ClinkrExit<MapBranchPrsResult>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.branchesJson,
		commandName: "map-branch-prs",
		inputDescription: "branches JSON payload",
		optionName: "--branches-json",
		schema: mapBranchPrsInputSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error")
		return failure(payloadResult.error.errorType, payloadResult.error.message);

	const branches = payloadResult.value.branches;
	const validationMessage = branchesValidationMessage(branches, "map-branch-prs");
	if (validationMessage !== null) return failure("invalid-request", validationMessage);

	const mapping = await mapBranchesToOpenPrs({
		branches,
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
	});
	if (mapping.type === "failure") return prFeedbackFailureExit(mapping.message, mapping.failure);
	const result = mapping.mapping;
	if (result.missingBranches.length === 0 && result.ambiguousBranches.length === 0)
		return ok(result);
	return negative(mappingFailureMessage(result), { data: result });
}

export function branchesValidationMessage(
	branches: readonly string[],
	commandName: string,
): string | null {
	return nonEmptyStringCollectionValidationMessage(branches, {
		commandName,
		emptyItemLabel: "branch",
		itemLabel: "branch",
		duplicateCollectionLabel: "branches",
	});
}

function mappingFailureMessage(result: MapBranchPrsResult): string {
	const ambiguousBranchNames = result.ambiguousBranches.map((entry) => entry.branch);
	if (result.missingBranches.length > 0 && ambiguousBranchNames.length > 0) {
		return `Could not map branches uniquely; missing: ${result.missingBranches.join(", ")}; ambiguous: ${ambiguousBranchNames.join(", ")}`;
	}
	if (ambiguousBranchNames.length > 0)
		return `Multiple open PRs found for branches: ${ambiguousBranchNames.join(", ")}`;
	return `No open PR found for branches: ${result.missingBranches.join(", ")}`;
}
