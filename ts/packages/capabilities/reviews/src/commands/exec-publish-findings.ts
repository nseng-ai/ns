import {
	publishFindingsRequestSchema,
	publishFindingsResultSchema,
	renderPublishFindingsResult,
	runPublishFindingsCommand,
	type PublishFindingsRequest,
} from "../operations/cli-operations.ts";
import { reviewsNsCommand } from "../ns/command.ts";

const EXEC_PUBLISH_FINDINGS_DESCRIPTION = `Publish Reviews findings to GitHub.

This hidden ns automation command preserves Reviews review-run envelope stdin contract: it reads a review-run Clinkr envelope from stdin, publishes inline and summary findings through Reviews gateway-injected GitHub publication boundary, and returns an enveloped publication result. It keeps diagnostics on stderr for automation logs and does not prompt for confirmation.`;

export const reviewsExecPublishFindingsCommand = reviewsNsCommand({
	name: "publish-findings",
	summary: "Publish Reviews findings to GitHub.",
	description: EXEC_PUBLISH_FINDINGS_DESCRIPTION,
	schema: publishFindingsRequestSchema,
	resultSchema: publishFindingsResultSchema,
	renderHuman: (data, _caps) => renderPublishFindingsResult(data),
	async handler(runtime, request) {
		return await runPublishFindingsCommand(runtime, request);
	},
});

export default reviewsExecPublishFindingsCommand;

export type ReviewsExecPublishFindingsRequest = PublishFindingsRequest;
