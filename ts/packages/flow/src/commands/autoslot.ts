import { runAutoslotCli } from "@sdl/ccc/autoslot";
import { defineExtension, failed, ok, z, type SdlCommand } from "@sdl/sdl/sdk";

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
		let stdout = "";
		let stderr = "";
		const exitCode = await runAutoslotCli({
			cwd: ctx.cwd,
			env: ctx.env,
			args: request.slug === undefined ? {} : { slug: request.slug },
			exec: async (command, args, options) =>
				await ctx.exec(
					command,
					args,
					options?.timeout === undefined ? {} : { timeoutMs: options.timeout },
				),
			stdout: (text) => {
				stdout += text;
				ctx.stdout?.(text);
			},
			stderr: (text) => {
				stderr += text;
				ctx.stderr?.(text);
			},
		});
		if (exitCode === 0) return ok(stdout === "" ? "Autoslot completed." : "");
		return failed(stderr === "" ? "Autoslot failed." : "", exitCode);
	},
};

export default defineExtension({
	commands: [flowAutoslotCommand],
});
