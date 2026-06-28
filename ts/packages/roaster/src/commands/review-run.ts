import { createSdlDomainCommand } from "@sdl/capability-kit/sdl-command";
import { defineExtension } from "sdl-sdk";

import { createRoasterClient } from "../api.ts";
import {
	clinkrExitFromReviewRunOutcome,
	renderReviewRun,
	reviewRunRequestSchema,
	type ReviewRunRequest,
} from "../operations/cli-operations.ts";
import { reviewRunResultSchema } from "../models.ts";
import { createSdlRoasterRuntime } from "./sdl-runtime.ts";

const REVIEW_RUN_DESCRIPTION = `Run a configured Roaster review over the current diff.

This SDL command adapts SDL execution context to Roaster's gateway-injected runtime, delegates review execution through the curated @sdl/roaster/api facade, writes the same Roaster Branch Memory review log as the standalone roaster CLI, and preserves review-run failure semantics. Discovery and group help read only manifest metadata; selected execution may run git, model, and Branch Memory operations.`;

export const roasterReviewRunCommand = createSdlDomainCommand({
	name: "run",
	summary: "Run a configured Roaster review over the current diff.",
	description: REVIEW_RUN_DESCRIPTION,
	schema: reviewRunRequestSchema,
	positionals: { key: { position: 0 } },
	resultSchema: reviewRunResultSchema,
	renderHuman: (data, _caps) => renderReviewRun(data),
	createContext: createSdlRoasterRuntime,
	async handler(runtime, request) {
		const outcome = await createRoasterClient({
			cwd: runtime.runScope.cwd,
			env: runtime.runScope.env,
			runtime,
		}).runReview(request);
		return clinkrExitFromReviewRunOutcome(runtime, outcome);
	},
});

export default defineExtension({
	commands: [roasterReviewRunCommand],
});

export type RoasterReviewRunRequest = ReviewRunRequest;
