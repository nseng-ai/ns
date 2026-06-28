import { failure, ok } from "@sdl/clinkr";
import { createSdlDomainCommand } from "@sdl/capability-kit/sdl-command";
import { defineExtension } from "sdl-sdk";

import { createRoasterClient } from "../api.ts";
import {
	renderReviewLog,
	reviewLogRequestSchema,
	reviewLogResultSchema,
	type ReviewLogRequest,
} from "../operations/cli-operations.ts";
import { createSdlRoasterRuntime } from "./sdl-runtime.ts";

const REVIEW_LOG_DESCRIPTION = `List Branch Memory review log entries for this branch, optionally filtered by review key.`;

export const roasterReviewLogCommand = createSdlDomainCommand({
	name: "log",
	summary: "List Roaster review logs for this branch.",
	description: REVIEW_LOG_DESCRIPTION,
	schema: reviewLogRequestSchema,
	positionals: { key: { position: 0 } },
	resultSchema: reviewLogResultSchema,
	renderHuman: (data, _caps) => renderReviewLog(data),
	createContext: createSdlRoasterRuntime,
	async handler(runtime, request) {
		const result = await createRoasterClient({
			cwd: runtime.runScope.cwd,
			env: runtime.runScope.env,
			runtime,
		}).listReviewLogs(request);
		if (!result.ok) return failure(result.failure.errorType, result.failure.message);
		return ok(result.result);
	},
});

export default defineExtension({
	commands: [roasterReviewLogCommand],
});

export type RoasterReviewLogRequest = ReviewLogRequest;
