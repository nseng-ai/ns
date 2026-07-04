import { defineExtension } from "@ns/kernel/sdk";

import { reviewRunResultSchema } from "../core/models.ts";
import {
	renderReviewRun,
	reviewRunRequestSchema,
	runReviewByKey,
	type ReviewRunRequest,
} from "../operations/cli-operations.ts";
import { roasterSdlCommand } from "../ns/command.ts";

const REVIEW_RUN_DESCRIPTION = `Run a configured Roaster review over the current diff.

This SDL command adapts SDL execution context to Roaster's gateway-injected runtime, delegates review execution through the shared Roaster operation wrapper, writes the Roaster Branch Memory review log, and preserves review-run failure semantics. Discovery and group help read only manifest metadata; selected execution may run git, model, and Branch Memory operations.`;

export const roasterReviewRunCommand = roasterSdlCommand({
	name: "run",
	summary: "Run a configured Roaster review over the current diff.",
	description: REVIEW_RUN_DESCRIPTION,
	schema: reviewRunRequestSchema,
	positionals: { key: { position: 0 } },
	options: {
		model: { short: "-m" },
		modelProfile: { short: "-p" },
		baseRef: { short: "-b" },
		logBranch: { short: "-l" },
		priorFindingsPrNumber: {},
		priorFindingsCap: {},
	},
	resultSchema: reviewRunResultSchema,
	renderHuman: (data, _caps) => renderReviewRun(data),
	async handler(runtime, request) {
		return await runReviewByKey(runtime, request);
	},
});

export default defineExtension({
	commands: [roasterReviewRunCommand],
});

export type RoasterReviewRunRequest = ReviewRunRequest;
