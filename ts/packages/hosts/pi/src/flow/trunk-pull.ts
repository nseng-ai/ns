import { registerCommandWithImmediateAck } from "../commands/ack.ts";
import { runTrunkPull } from "@sdl/ccc/trunk-pull";
import type { ExecResult } from "@sdl/core/exec";

const COMMAND_NAME = "sdl:flow:pull-trunk";

export type { ExecResult } from "@sdl/core/exec";

type NotifyLevel = "info" | "warning" | "error";

export interface CommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

export default function trunkPullExtension(pi: ExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Pull Graphite trunk without running full gt sync",
			handler: async (args, ctx) => {
				await runPiTrunkPull(pi, ctx, args);
			},
		},
	});
}

export async function runPiTrunkPull(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: CommandContext,
	args: string,
): Promise<boolean> {
	if (args.trim().length > 0) {
		ctx.ui.notify(
			"`/sdl:flow:pull-trunk` does not accept arguments. Run it with no text after the command.",
			"error",
		);
		return false;
	}

	await ctx.waitForIdle();
	const result = await runTrunkPull({ exec: pi.exec.bind(pi) }, ctx.cwd);
	ctx.ui.notify(result.message, result.ok ? "info" : "error");
	return result.ok;
}
