import { runLandCli } from "@sdl/ccc/land";
import { defineExtension, failed, ok, z, type SdlCommand } from "@sdl/sdl/sdk";

import { createCliExecAdapter } from "../shared/worktree.ts";

const landSchema = z.object({
	yes: z.boolean().optional().describe("Confirm stack landing without an interactive prompt."),
	dryRun: z.boolean().optional().describe("Show what would land without merging PRs."),
});

export const flowLandCommand: SdlCommand<typeof landSchema> = {
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
			exec: createCliExecAdapter({ ctx, ...(onOutput === undefined ? {} : { onOutput }) }),
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
};

export default defineExtension({
	commands: [flowLandCommand],
});
