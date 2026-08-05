import {
	publishFindingsRequestSchema,
	publishFindingsResultSchema,
	renderPublishFindingsResult,
	runPublishFindingsCommand,
} from "../../../../../operations/cli-operations.ts";
import { reviewsNsCommand } from "../../../../command.ts";

const reviewsExecPublishFindingsCommand = reviewsNsCommand({
	schema: publishFindingsRequestSchema,
	resultSchema: publishFindingsResultSchema,
	renderHuman: (data, _caps) => renderPublishFindingsResult(data),
	async handler(runtime, request) {
		return await runPublishFindingsCommand(runtime, request);
	},
});

export async function command() {
	return reviewsExecPublishFindingsCommand;
}
