import {
	registerCommandWithImmediateAck,
	type ImmediateCommandAckCommandRegistrar,
	type ImmediateCommandNotifyContext,
} from "@sdl/pi/commands/ack";
import type {
	PiCommandContext,
	PiCommandHost,
	PiCommandRegistration,
} from "@sdl/pi/runtime/command-host";
import { buildSkillInvocationPrompt, expandRepoSkillBlock } from "@sdl/pi/skills/expansion";

import { genericBackingSkillCommandSpecs, type DerivedPiCommand } from "./specs.ts";

export interface BackingSkillCommandContext
	extends
		Pick<PiCommandContext, "cwd" | "hasUI">,
		ImmediateCommandNotifyContext<"info" | "warning" | "error"> {
	waitForIdle(): Promise<void> | void;
}

export type BackingSkillCommand = Omit<PiCommandRegistration, "handler"> & {
	handler(args: string, ctx: BackingSkillCommandContext): Promise<void> | void;
};

export type BackingSkillCommandHost = ImmediateCommandAckCommandRegistrar<BackingSkillCommand> &
	Pick<PiCommandHost, "sendUserMessage">;

interface HandleBackingSkillCommandOptions {
	host: BackingSkillCommandHost;
	spec: DerivedPiCommand;
	args: string;
	ctx: BackingSkillCommandContext;
}

export function registerBackingSkillCommands(host: BackingSkillCommandHost): void {
	for (const spec of genericBackingSkillCommandSpecs()) {
		registerCommandWithImmediateAck({
			host: host,
			commandName: spec.surface,
			commandDefinition: {
				description: `Invoke ${spec.skillName} as a command-converted backing skill.`,
				argumentHint: "[initial request]",
				handler: async (args, ctx) => handleBackingSkillCommand({ host, spec, args, ctx }),
			},
		});
	}
}

export default registerBackingSkillCommands;

async function handleBackingSkillCommand(options: HandleBackingSkillCommandOptions): Promise<void> {
	const { host, spec, args, ctx } = options;
	await ctx.waitForIdle();
	let skillBlock: string;
	try {
		skillBlock = (await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: spec.skillName })).block;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notifyCommandUi(ctx, `Could not read ${spec.skillName} backing skill: ${message}`, "error");
		return;
	}

	notifyCommandUi(
		ctx,
		`Invoking ${spec.skillName}${args.trim().length > 0 ? " with initial context" : ""}.`,
		"info",
	);
	await host.sendUserMessage(buildBackingSkillPrompt(spec, skillBlock, args));
}

function notifyCommandUi(
	ctx: BackingSkillCommandContext,
	message: string,
	level: "info" | "warning" | "error",
): void {
	ctx.ui?.notify?.(message, level);
}

function buildBackingSkillPrompt(spec: DerivedPiCommand, skillBlock: string, args: string): string {
	return buildSkillInvocationPrompt({
		skillName: spec.skillName,
		skillBlock,
		initialRequest: args,
	});
}
