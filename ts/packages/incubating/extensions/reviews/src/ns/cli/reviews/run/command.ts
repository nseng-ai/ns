import { reviewRunResultSchema } from "../../../../core/models.ts";
import {
	renderReviewRun,
	reviewRunRequestSchema,
	runReviewByKey,
} from "../../../../operations/cli-operations.ts";
import { reviewsNsCommand } from "../../../command.ts";

const reviewRunCommand = reviewsNsCommand({
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

export async function command() {
	return reviewRunCommand;
}
