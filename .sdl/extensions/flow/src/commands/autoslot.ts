import { runAutoslotCli } from "@sdl/ccc/autoslot";
import { defineExtension, failed, ok, z, type SdlExtensionApi } from "@sdl/sdl/sdk";

const autoslotSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the worktree or latest commit."),
});

export default defineExtension({
	commands: [
		{
			name: "autoslot",
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
						await ctx.exec(command, args, {
							cwd: options?.cwd,
							timeoutMs: options?.timeout,
						}),
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
		},
	],
});
