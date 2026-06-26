import { runAutoslotCli } from "@sdl/ccc/autoslot";
import { defineExtension, z, type SdlCommand } from "sdl-sdk";

import { runFlowCccCli } from "../shared/ccc-cli.ts";

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
	run: async (ctx, request) =>
		await runFlowCccCli({
			ctx,
			successMessage: "Autoslot completed.",
			failureMessage: "Autoslot failed.",
			run: async (io) =>
				await runAutoslotCli({
					cwd: ctx.cwd,
					env: ctx.env,
					args: request.slug === undefined ? {} : { slug: request.slug },
					exec: io.exec,
					stdout: io.stdout,
					stderr: io.stderr,
					onOutput: ctx.onOutput,
				}),
		}),
};

export default defineExtension({
	commands: [flowAutoslotCommand],
});
