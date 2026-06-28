import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@sdl/clinkr";
import { mapBranchesToOpenPrs } from "./core/branch-pr-mapping.ts";
import { duplicateValues } from "./duplicate-values.ts";
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
export type BranchPrEntry = MapBranchPrsResult["branch_prs"][number];
export type AmbiguousBranchPrEntry = MapBranchPrsResult["ambiguous_branches"][number];

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
	if (validationMessage !== null) return failure("invalid_request", validationMessage);

	const mapping = await mapBranchesToOpenPrs({
		branches,
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
	});
	if (mapping.type === "failure") return prFeedbackFailureExit(mapping.message, mapping.failure);
	const result = mapping.mapping;
	if (result.missing_branches.length === 0 && result.ambiguous_branches.length === 0)
		return ok(result);
	return negative(mappingFailureMessage(result), { data: result });
}

export function branchesValidationMessage(
	branches: readonly string[],
	commandName: string,
): string | null {
	if (branches.length === 0) return `${commandName} requires at least one branch.`;
	if (!branches.every((branch) => branch.trim() !== ""))
		return `${commandName} requires every branch to be non-empty.`;
	const duplicates = duplicateValues(branches);
	if (duplicates.length > 0)
		return `${commandName} branches contain duplicates: ${duplicates.join(", ")}`;
	return null;
}

function mappingFailureMessage(result: MapBranchPrsResult): string {
	const ambiguousBranchNames = result.ambiguous_branches.map((entry) => entry.branch);
	if (result.missing_branches.length > 0 && ambiguousBranchNames.length > 0) {
		return `Could not map branches uniquely; missing: ${result.missing_branches.join(", ")}; ambiguous: ${ambiguousBranchNames.join(", ")}`;
	}
	if (ambiguousBranchNames.length > 0)
		return `Multiple open PRs found for branches: ${ambiguousBranchNames.join(", ")}`;
	return `No open PR found for branches: ${result.missing_branches.join(", ")}`;
}
