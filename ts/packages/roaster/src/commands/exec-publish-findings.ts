import { defineExtension } from "sdl-sdk";

import {
	publishFindingsRequestSchema,
	publishFindingsResultSchema,
	renderPublishFindingsResult,
	runPublishFindingsCommand,
	type PublishFindingsRequest,
} from "../operations/cli-operations.ts";
import { roasterSdlCommand } from "../sdl/command.ts";

const EXEC_PUBLISH_FINDINGS_DESCRIPTION = `Publish Roaster findings to GitHub.

This hidden SDL automation command preserves Roaster's review-run envelope stdin contract: it reads a review-run Clinkr envelope from stdin, publishes inline and summary findings through Roaster's gateway-injected GitHub publication boundary, and returns an enveloped publication result. It keeps diagnostics on stderr for automation logs and does not prompt for confirmation.`;

export const roasterExecPublishFindingsCommand = roasterSdlCommand({
	name: "exec-publish-findings",
	summary: "Publish Roaster findings to GitHub.",
	description: EXEC_PUBLISH_FINDINGS_DESCRIPTION,
	schema: publishFindingsRequestSchema,
	resultSchema: publishFindingsResultSchema,
	renderHuman: (data, _caps) => renderPublishFindingsResult(data),
	async handler(runtime, request) {
		return await runPublishFindingsCommand(runtime, request);
	},
});

export default defineExtension({
	commands: [roasterExecPublishFindingsCommand],
});

export type RoasterExecPublishFindingsRequest = PublishFindingsRequest;
