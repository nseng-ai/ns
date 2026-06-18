import { formatShellArg } from "@asdl/core/exec";
import type { CommandContext, ExtensionAPI, ModelInfo, ThinkingLevel } from "./types.ts";

export interface PiLaunchOptions {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
}

export function getPiLaunchOptions(
	pi: Pick<ExtensionAPI, "getThinkingLevel">,
	ctx: Pick<CommandContext, "model">,
): PiLaunchOptions {
	const thinkingLevel = pi.getThinkingLevel();
	if (ctx.model === undefined) {
		return { thinkingLevel };
	}
	return { model: ctx.model, thinkingLevel };
}

export function buildPiLaunchCommand(
	initialArgument: string,
	launchOptions: PiLaunchOptions,
): string {
	const args = ["pi"];
	if (launchOptions.model !== undefined) {
		args.push("--provider", launchOptions.model.provider, "--model", launchOptions.model.id);
	}
	if (launchOptions.thinkingLevel !== "off") {
		args.push("--thinking", launchOptions.thinkingLevel);
	}
	args.push(initialArgument);
	return args.map(formatShellArg).join(" ");
}
