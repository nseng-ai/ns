import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { loadJsonInput } from "@nseng-ai/extension-kit/json-input";

import { branchPrChecksInputSchema } from "./branch-pr-checks.ts";
import { branchPrChecksMappingGaps } from "./core/branch-pr-checks.ts";
import { branchPrMappingGapsMessage } from "./core/branch-pr-mapping.ts";
import { waitForBranchPrChecks, type WaitForChecksReport } from "./core/wait-for-checks.ts";
import {
	defineExecOperation,
	gatewayOptions,
	prFeedbackFailureExit,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import { branchesValidationMessage } from "./map-branch-prs.ts";
import { waitForChecksResultSchema } from "./operation-schemas/collection.ts";

export const WAIT_FOR_CHECKS_DEFAULT_TIMEOUT_SECONDS = 900;
export const WAIT_FOR_CHECKS_DEFAULT_INTERVAL_SECONDS = 15;

const waitForChecksParseSchema = z.object({
	branchesJson: z.string().optional(),
	timeoutSeconds: z.int().min(1).default(WAIT_FOR_CHECKS_DEFAULT_TIMEOUT_SECONDS),
	intervalSeconds: z.int().min(1).default(WAIT_FOR_CHECKS_DEFAULT_INTERVAL_SECONDS),
});

type WaitForChecksRequest = z.output<typeof waitForChecksParseSchema>;

export type WaitForChecksOpResult = z.output<typeof waitForChecksResultSchema>;

export const waitForChecksOperation = defineExecOperation({
	isRepoContextRequired: true,
	resultSchema: waitForChecksResultSchema,
	spec: {
		name: "wait-for-checks",
		description:
			"Wait until the branches' open-PR checks settle (failures reported as soon as observed) and return the outcome once.",
		schema: waitForChecksParseSchema,
		handler: runWaitForChecksOperation,
	},
});

async function runWaitForChecksOperation(
	ctx: PrAddressExecContext,
	request: WaitForChecksRequest,
): Promise<ClinkrExit<WaitForChecksReport>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.branchesJson,
		commandName: "wait-for-checks",
		inputDescription: "branches JSON payload",
		optionName: "--branches-json",
		schema: branchPrChecksInputSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error")
		return failure(payloadResult.error.errorType, payloadResult.error.message);

	const branches = payloadResult.value.branches;
	const validationMessage = branchesValidationMessage(branches, "wait-for-checks");
	if (validationMessage !== null) return failure("invalid-request", validationMessage);

	const result = await waitForBranchPrChecks({
		branches,
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
		clock: ctx.context.clock,
		timers: ctx.context.timers,
		timeoutMs: request.timeoutSeconds * 1000,
		intervalMs: request.intervalSeconds * 1000,
	});
	if (result.type === "failure") return prFeedbackFailureExit(result.message, result.failure);
	const report = result.report;
	switch (report.outcome) {
		case "passing":
			return ok(report);
		case "failing":
			return negative(failingMessage(report), report);
		case "timeout":
			return negative(timeoutMessage(report, request.timeoutSeconds), report);
		case "mapping-gap":
			return negative(branchPrMappingGapsMessage(branchPrChecksMappingGaps(report)), report);
	}
}

function failingMessage(report: WaitForChecksReport): string {
	const branches = report.entries
		.filter(
			(entry) =>
				entry.status === "found" && (entry.counts.failing > 0 || entry.counts.cancelled > 0),
		)
		.map((entry) => entry.branch);
	return `PR checks concluded with failures for branches: ${branches.join(", ")}`;
}

function timeoutMessage(report: WaitForChecksReport, timeoutSeconds: number): string {
	const branches = report.entries
		.filter((entry) => entry.status === "found" && entry.counts.pending > 0)
		.map((entry) => entry.branch);
	return `Timed out after ${timeoutSeconds}s waiting for PR checks to settle; still pending: ${branches.join(", ")}`;
}
