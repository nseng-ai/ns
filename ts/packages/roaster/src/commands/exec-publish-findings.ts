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

const EXEC_PUBLISH_FINDINGS_DESCRIPTION = `Publish inline and summary findings from a Roaster run envelope on stdin.

This hidden SDL automation command replaces the standalone roaster exec publish-findings binary path for CI. It preserves the existing stdin envelope contract and keeps GitHub publication guarded inside Roaster-owned domain logic.`;

export const roasterExecPublishFindingsCommand = createSdlDomainCommand({
	name: "exec-publish-findings",
	summary: "Publish Roaster findings from stdin.",
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
		return clinkrExitFromPublishFindingsOutcome(outcome);
	},
});

export default defineExtension({
	commands: [roasterExecPublishFindingsCommand],
});

export type RoasterExecPublishFindingsRequest = PublishFindingsRequest;
