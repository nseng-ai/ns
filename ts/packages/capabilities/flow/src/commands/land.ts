import { runLandCli } from "@sdl/ccc/land";
import { defineExtension, z, type SdlCommand } from "sdl-sdk";

import { runFlowCccCli } from "../shared/ccc-cli.ts";

const landSchema = z.object({
	yes: z.boolean().optional().describe("Confirm stack landing without an interactive prompt."),
	dryRun: z.boolean().optional().describe("Show what would land without merging PRs."),
	free: z
		.boolean()
		.optional()
		.describe(
			"After successful landing, free the current managed slot and delete the landed local branch.",
		),
	force: z.boolean().optional().describe("Skip the post-landing --free confirmation."),
});

export const flowLandCommand: SdlCommand<typeof landSchema> = {
	name: "land",
	summary: "Land the current PR or Graphite stack into trunk.",
	description: "Land the current PR or Graphite stack into trunk.",
	schema: landSchema,
	run: async (ctx, request) => {
		const onOutput = ctx.onOutput;
		const rawArgs = [
			request.yes === true ? "--yes" : undefined,
			request.dryRun === true ? "--dry-run" : undefined,
			request.free === true ? "--free" : undefined,
			request.force === true ? "--force" : undefined,
		].filter((arg): arg is string => arg !== undefined);
		return await runFlowCccCli({
			ctx,
			successMessage: "Land completed.",
			failureMessage: "Land failed.",
			shouldForwardLiveOutput: true,
			run: async (io) =>
				await runLandCli({
					cwd: ctx.cwd,
					rawArgs: rawArgs.join(" "),
					exec: io.exec,
					stdout: io.stdout,
					stderr: io.stderr,
					...(onOutput === undefined ? {} : { onOutput }),
					...(ctx.confirm === undefined ? {} : { confirm: ctx.confirm }),
				}),
		});
	},
};

export default defineExtension({
	commands: [flowLandCommand],
});
