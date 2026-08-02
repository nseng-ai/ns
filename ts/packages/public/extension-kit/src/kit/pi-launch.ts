import { formatShellArg } from "@nseng-ai/foundation/exec";
import type { ModelInfo, ThinkingLevel } from "./pi-types.ts";

export interface PiLaunchOptions {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
}

export interface PiLaunchThinkingHost {
	getThinkingLevel(): ThinkingLevel;
}

export interface PiLaunchCommandContext {
	model?: ModelInfo;
}

export function getPiLaunchOptions(
	pi: PiLaunchThinkingHost,
	ctx: PiLaunchCommandContext,
): PiLaunchOptions {
	const thinkingLevel = pi.getThinkingLevel();
	return ctx.model === undefined ? { thinkingLevel } : { model: ctx.model, thinkingLevel };
}

/**
 * Builds the Pi argv for a launch. Pass `undefined` as the initial argument to
 * launch Pi interactively without any initial prompt or file input.
 */
export function buildPiLaunchArgs(
	initialArgument: string | undefined,
	launchOptions: PiLaunchOptions,
): string[] {
	return [
		"pi",
		...buildPiModelThinkingArgs(launchOptions),
		...(initialArgument === undefined ? [] : [initialArgument]),
	];
}

/** Owns the Pi CLI policy for model and thinking launch flags. */
export function buildPiModelThinkingArgs(launchOptions: PiLaunchOptions): string[] {
	const args: string[] = [];
	if (launchOptions.model !== undefined) {
		args.push("--provider", launchOptions.model.provider, "--model", launchOptions.model.id);
	}
	if (launchOptions.thinkingLevel !== "off") args.push("--thinking", launchOptions.thinkingLevel);
	return args;
}

export function buildPiLaunchCommand(
	initialArgument: string,
	launchOptions: PiLaunchOptions,
): string {
	return buildPiLaunchArgs(initialArgument, launchOptions).map(formatShellArg).join(" ");
}
