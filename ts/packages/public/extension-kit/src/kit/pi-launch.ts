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

export function buildPiLaunchArgs(
	initialArgument: string,
	launchOptions: PiLaunchOptions,
): string[] {
	return [...buildPiLaunchOptionArgs(launchOptions), initialArgument];
}

export function buildPiLaunchCommand(
	initialArgument: string,
	launchOptions: PiLaunchOptions,
): string {
	return buildPiLaunchArgs(initialArgument, launchOptions).map(formatShellArg).join(" ");
}

export function buildPiSessionLaunchArgs(
	sessionPath: string,
	launchOptions: PiLaunchOptions,
): string[] {
	return [...buildPiLaunchOptionArgs(launchOptions), "--session", sessionPath];
}

export function buildPiSessionLaunchCommand(
	sessionPath: string,
	launchOptions: PiLaunchOptions,
): string {
	return buildPiSessionLaunchArgs(sessionPath, launchOptions).map(formatShellArg).join(" ");
}

function buildPiLaunchOptionArgs(launchOptions: PiLaunchOptions): string[] {
	const args = ["pi"];
	if (launchOptions.model !== undefined) {
		args.push("--provider", launchOptions.model.provider, "--model", launchOptions.model.id);
	}
	if (launchOptions.thinkingLevel !== "off") args.push("--thinking", launchOptions.thinkingLevel);
	return args;
}
