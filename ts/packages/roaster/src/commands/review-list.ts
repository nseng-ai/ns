import { failure, ok } from "@sdl/clinkr";
import { SdlCommandExecApi } from "@sdl/capability-kit/command-runner";
import { defineExtension, type SdlCommand, type SdlExtensionApi } from "sdl-sdk";

import { createRoasterClient } from "../api.ts";
import { createRealRoasterContext, createRoasterRuntime, type RoasterRuntime } from "../context.ts";
import {
	renderReviewList,
	reviewListRequestSchema,
	reviewListResultSchema,
	type ReviewListRequest,
	type ReviewListResult,
} from "../operations/cli-operations.ts";

const REVIEW_LIST_DESCRIPTION = `List configured Roaster review definitions.

This SDL command is the first Roaster command-face proof. It adapts SDL execution context to Roaster's gateway-injected runtime, then delegates through the curated @sdl/roaster/api facade. Discovery and top-level help read only manifest metadata; selected help loads this command for its schema and detailed description without running git, Branch Memory, model, or GitHub operations.`;

export const roasterReviewListCommand: SdlCommand<
	typeof reviewListRequestSchema,
	ReviewListResult
> = {
	name: "review-list",
	summary: "List configured Roaster review definitions.",
	description: REVIEW_LIST_DESCRIPTION,
	schema: reviewListRequestSchema,
	resultSchema: reviewListResultSchema,
	renderHuman: (data, _caps) => renderReviewList(reviewListResultSchema.parse(data)),
	async run(ctx, request) {
		const result = await createRoasterClient({
			cwd: ctx.cwd,
			env: ctx.env,
			runtime: createSdlRoasterRuntime(ctx),
		}).listReviews(request);
		if (!result.ok) return failure(result.failure.errorType, result.failure.message);
		return ok(result.result);
	},
};

export default defineExtension({
	commands: [roasterReviewListCommand],
});

function createSdlRoasterRuntime(ctx: SdlExtensionApi): RoasterRuntime {
	const execApi = new SdlCommandExecApi(ctx);
	return createRoasterRuntime(
		createRealRoasterContext({
			cwd: ctx.cwd,
			env: ctx.env,
			stdin: async () => "",
			stdout: ctx.stdout ?? (() => undefined),
			stderr: ctx.stderr ?? (() => undefined),
			execApi,
		}),
	);
}

export type RoasterReviewListRequest = ReviewListRequest;
