import { createSdlDomainCommand } from "@sdl/capability-kit/sdl-command";
import { defineExtension } from "sdl-sdk";

import { createRoasterClient } from "../api.ts";
import {
	clinkrExitFromPublishFindingsOutcome,
	publishFindingsRequestSchema,
	publishFindingsResultSchema,
	renderPublishFindingsDiagnostics,
	type PublishFindingsRequest,
} from "../operations/cli-operations.ts";
import { createSdlRoasterRuntime } from "./sdl-runtime.ts";

const EXEC_PUBLISH_FINDINGS_DESCRIPTION = `Publish Roaster findings to GitHub.

This hidden SDL automation command preserves Roaster's review-run envelope stdin contract: it reads a review-run Clinkr envelope from stdin, publishes inline and summary findings through Roaster's gateway-injected GitHub publication boundary, and returns an enveloped publication result. It keeps diagnostics on stderr for automation logs and does not prompt for confirmation.`;

export const roasterExecPublishFindingsCommand = createSdlDomainCommand({
	name: "exec-publish-findings",
	summary: "Publish Roaster findings to GitHub.",
	description: EXEC_PUBLISH_FINDINGS_DESCRIPTION,
	schema: publishFindingsRequestSchema,
	resultSchema: publishFindingsResultSchema,
	renderHuman: (data, _caps) => renderPublishFindingsDiagnostics(data),
	createContext: createSdlRoasterRuntime,
	async handler(runtime, request: PublishFindingsRequest) {
		const outcome = await createRoasterClient({
			cwd: runtime.runScope.cwd,
			env: runtime.runScope.env,
			runtime,
		}).publishFindings(request);
		if (outcome.type === "ok") {
			runtime.stderr(
				renderPublishFindingsDiagnostics(publishFindingsResultSchema.parse(outcome.value)),
			);
		}
		return clinkrExitFromPublishFindingsOutcome(outcome);
	},
});

export default defineExtension({
	commands: [roasterExecPublishFindingsCommand],
});

export type RoasterExecPublishFindingsRequest = PublishFindingsRequest;
