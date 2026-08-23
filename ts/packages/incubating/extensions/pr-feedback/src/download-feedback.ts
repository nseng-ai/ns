import { z } from "zod";

import { negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { collectDownloadFeedback, type DownloadFeedbackPayload } from "./core/download-feedback.ts";
import {
	defineExecOperation,
	gatewayOptions,
	prTargetFailureExit,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import { downloadFeedbackResultSchema } from "./operation-schemas/collection.ts";

const downloadFeedbackParseSchema = z.object({
	prNumber: z.int().optional(),
	includeResolved: z.boolean().default(false),
	includeAutomation: z.boolean().default(false),
	includeEmptyReviews: z.boolean().default(false),
});

type DownloadFeedbackRequest = z.output<typeof downloadFeedbackParseSchema>;
type DownloadFeedbackResult = z.output<typeof downloadFeedbackResultSchema>;

export const downloadFeedbackOperation = defineExecOperation({
	isRepoContextRequired: true,
	resultSchema: downloadFeedbackResultSchema,
	spec: {
		name: "download-feedback",
		description: "Download current PR feedback as a Markdown report.",
		schema: downloadFeedbackParseSchema,
		handler: runDownloadFeedbackOperation,
	},
});

async function runDownloadFeedbackOperation(
	ctx: PrAddressExecContext,
	request: DownloadFeedbackRequest,
): Promise<ClinkrExit<DownloadFeedbackResult>> {
	const result = await collectDownloadFeedback({
		git: ctx.context.git,
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
		...optionalEntry("prNumber", request.prNumber),
		includeResolved: request.includeResolved,
		includeAutomation: request.includeAutomation,
		includeEmptyReviews: request.includeEmptyReviews,
	});

	switch (result.type) {
		case "ok":
			return ok(commandPayload(result.feedback));
		case "miss":
			return negative(result.message, commandPayload(result.feedback));
		case "git_failure":
		case "pr_feedback_failure":
		case "detached_head":
			return prTargetFailureExit(result);
	}
}

function commandPayload(feedback: DownloadFeedbackPayload): DownloadFeedbackResult {
	return feedback;
}
