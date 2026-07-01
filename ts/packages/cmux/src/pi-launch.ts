import { formatShellArg } from "@sdl/exec";
import type { ModelInfo, ThinkingLevel } from "./types.ts";

export type PiLaunchThinkingLevel = ThinkingLevel;

export type PiLaunchModelInfo = ModelInfo;

export interface PiLaunchOptions {
	model?: PiLaunchModelInfo;
	thinkingLevel: PiLaunchThinkingLevel;
}

export interface PiLaunchThinkingHost {
	getThinkingLevel(): PiLaunchThinkingLevel;
}

export interface PiLaunchCommandContext {
	model?: PiLaunchModelInfo;
}

export function getPiLaunchOptions(
	pi: PiLaunchThinkingHost,
	ctx: PiLaunchCommandContext,
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
