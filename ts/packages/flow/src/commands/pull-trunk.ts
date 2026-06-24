import { runTrunkPullCli } from "@sdl/ccc/trunk-pull";
import { defineExtension, failed, ok, z, type SdlCommand } from "@sdl/sdl/sdk";

import { createCliExecAdapter } from "../shared/worktree.ts";

const pullTrunkSchema = z.object({});

export const flowPullTrunkCommand: SdlCommand<typeof pullTrunkSchema> = {
	name: "pull-trunk",
	summary: "Pull the configured Graphite trunk branch without running full gt sync.",
	description: "Pull the configured Graphite trunk branch without running full gt sync.",
	schema: pullTrunkSchema,
	run: async (ctx) => {
		let stdout = "";
		let stderr = "";
		const exitCode = await runTrunkPullCli({
			cwd: ctx.cwd,
			exec: createCliExecAdapter({ ctx }),
			stdout: (text) => {
				stdout += text;
				ctx.stdout?.(text);
			},
			stderr: (text) => {
				stderr += text;
				ctx.stderr?.(text);
			},
		});
		if (exitCode === 0) return ok(stdout === "" ? "Pull trunk completed." : "");
		return failed(stderr === "" ? "Pull trunk failed." : "", exitCode);
	},
};

export default defineExtension({
	commands: [flowPullTrunkCommand],
});
