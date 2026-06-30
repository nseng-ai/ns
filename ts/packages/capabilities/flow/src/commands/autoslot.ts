import { runAutoslotCli } from "../autoslot.ts";
import { defineExtension, z, type SdlCommand } from "sdl-sdk";

import { runFlowCli } from "../shared/flow-cli-runner.ts";
import { resolveFlowStreamCaps } from "../shared/phase-stream.ts";

const autoslotSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the worktree or latest commit."),
});

export const flowAutoslotCommand: SdlCommand<typeof autoslotSchema> = {
	name: "autoslot",
	summary: "Create a Graphite branch from current work, then move it into a managed slot worktree.",
	description:
		"Create a Graphite branch from current work, then move it into a managed slot worktree.",
	schema: autoslotSchema,
	run: async (ctx, request) => {
		// Resolve caps at the host-extension seam (house-style §1) and thread them into the Flow CLI
		// edge so autoslot durable outcomes render in the house style next to where facts are computed.
		const caps = resolveFlowStreamCaps(ctx);
		return await runFlowCli({
			ctx,
			successMessage: "Autoslot completed.",
			failureMessage: "Autoslot failed.",
			run: async (io) =>
				await runAutoslotCli({
					cwd: ctx.cwd,
					env: ctx.env,
					args: request.slug === undefined ? {} : { slug: request.slug },
					caps,
					exec: io.exec,
					stdout: io.stdout,
					stderr: io.stderr,
					...(ctx.onOutput === undefined ? {} : { onOutput: ctx.onOutput }),
				}),
		});
	},
};

export default defineExtension({
	commands: [flowAutoslotCommand],
});
