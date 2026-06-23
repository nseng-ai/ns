import { runLandCli } from "@sdl/ccc/land";
import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";

const landSchema = z.object({
	yes: z.boolean().optional().describe("Confirm stack landing without an interactive prompt."),
	dryRun: z.boolean().optional().describe("Show what would land without merging PRs."),
});

export default defineExtension({
	commands: [
		{
			name: "land",
			summary: "Land the current PR or Graphite stack into trunk.",
			description: "Land the current PR or Graphite stack into trunk.",
			schema: landSchema,
			run: async (ctx, request) => {
				let stdout = "";
				let stderr = "";
				const onOutput = ctx.onOutput;
				const rawArgs = [
					request.yes === true ? "--yes" : undefined,
					request.dryRun === true ? "--dry-run" : undefined,
				].filter((arg): arg is string => arg !== undefined);
				const exitCode = await runLandCli({
					cwd: ctx.cwd,
					rawArgs: rawArgs.join(" "),
					exec: async (command, args, options) =>
						await ctx.exec(command, args, {
							cwd: options?.cwd,
							timeoutMs: options?.timeout,
							...(onOutput === undefined
								? {}
								: {
										onStdout: (text: string) => onOutput("stdout", text),
										onStderr: (text: string) => onOutput("stderr", text),
									}),
						}),
					stdout: (text) => {
						stdout += text;
						ctx.stdout?.(text);
					},
					stderr: (text) => {
						stderr += text;
						ctx.stderr?.(text);
					},
					...(onOutput === undefined ? {} : { onOutput }),
					...(ctx.confirm === undefined ? {} : { confirm: ctx.confirm }),
				});
				if (exitCode === 0) return ok(stdout === "" ? "Land completed." : "");
				return failed(stderr === "" ? "Land failed." : "", exitCode);
			},
		},
	],
});
