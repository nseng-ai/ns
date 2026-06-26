import { runTrunkPullCli } from "@sdl/ccc/trunk-pull";
import { defineExtension, z, type SdlCommand } from "sdl-sdk";

import { runFlowCccCli } from "../shared/ccc-cli.ts";

const pullTrunkSchema = z.object({});

export const flowPullTrunkCommand: SdlCommand<typeof pullTrunkSchema> = {
	name: "pull-trunk",
	summary: "Pull the configured Graphite trunk branch without running full gt sync.",
	description: "Pull the configured Graphite trunk branch without running full gt sync.",
	schema: pullTrunkSchema,
	run: async (ctx) =>
		await runFlowCccCli({
			ctx,
			successMessage: "Pull trunk completed.",
			failureMessage: "Pull trunk failed.",
			run: async (io) =>
				await runTrunkPullCli({
					cwd: ctx.cwd,
					exec: io.exec,
					stdout: io.stdout,
					stderr: io.stderr,
				}),
		}),
};

export default defineExtension({
	commands: [flowPullTrunkCommand],
});
