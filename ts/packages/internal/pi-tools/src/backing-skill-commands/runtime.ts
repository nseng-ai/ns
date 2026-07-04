import {
	registerCommandWithImmediateAck,
	type ImmediateCommandAckCommandRegistrar,
} from "@ns/pi/commands/ack";
import type {
	PiCommandContext,
	PiCommandHost,
	PiCommandRegistration,
} from "@ns/pi/runtime/command-host";
import { buildSkillInvocationPrompt, invokeRepoSkillPromptTurn } from "@ns/pi/skills/expansion";

import { genericBackingSkillCommandSpecs, type DerivedPiCommand } from "./specs.ts";

export type BackingSkillCommandContext = Pick<
	PiCommandContext,
	"cwd" | "hasUI" | "ui" | "waitForIdle"
>;

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
	await invokeRepoSkillPromptTurn({
		host,
		ctx,
		skillName: spec.skillName,
		fallbackMessage: `Could not read ${spec.skillName} backing skill; invoking without backing skill content.`,
		successMessage: `Invoking ${spec.skillName}${args.trim().length > 0 ? " with initial context" : ""}.`,
		buildPrompt: (skillBlock) => buildBackingSkillPrompt(spec, skillBlock, args),
	});
}

function buildBackingSkillPrompt(
	spec: DerivedPiCommand,
	skillBlock: string | undefined,
	args: string,
): string {
	return buildSkillInvocationPrompt({
		skillName: spec.skillName,
		initialRequest: args,
		...(skillBlock === undefined ? {} : { skillBlock }),
	});
}
