import { createSdlDomainCommand } from "@sdl/capability-kit/sdl-command";
import { defineExtension } from "sdl-sdk";

import { createRoasterClient } from "../api.ts";
import { reviewRunResultSchema } from "../models.ts";
import {
	clinkrExitFromRecordFindingsOutcome,
	recordFindingsRequestSchema,
	renderReviewRun,
	type RecordFindingsRequest,
} from "../operations/cli-operations.ts";
import { createSdlRoasterRuntime } from "./sdl-runtime.ts";

const EXEC_RECORD_FINDINGS_DESCRIPTION = `Record same-session Roaster findings from stdin.

This hidden SDL automation command preserves Roaster's record-findings JSON stdin contract, validates the findings payload inside Roaster-owned logic, and writes the same Branch Memory review log under namespace roaster and reviews/<review-key>/... keys. It intentionally does not publish findings to GitHub.`;

export const roasterExecRecordFindingsCommand = createSdlDomainCommand({
	name: "exec-record-findings",
	summary: "Record same-session Roaster findings from stdin.",
	description: EXEC_RECORD_FINDINGS_DESCRIPTION,
	schema: recordFindingsRequestSchema,
	resultSchema: reviewRunResultSchema,
	renderHuman: (data, _caps) => renderReviewRun(data),
	createContext: createSdlRoasterRuntime,
	async handler(runtime, request) {
		const outcome = await createRoasterClient({
			cwd: runtime.runScope.cwd,
			env: runtime.runScope.env,
			runtime,
		}).recordFindings(request);
		return clinkrExitFromRecordFindingsOutcome(runtime, outcome);
	},
});

export default defineExtension({
	commands: [roasterExecRecordFindingsCommand],
});

export type RoasterExecRecordFindingsRequest = RecordFindingsRequest;
