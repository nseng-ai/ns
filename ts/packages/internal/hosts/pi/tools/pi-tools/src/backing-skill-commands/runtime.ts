import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import {
	registerCommandWithImmediateAck,
	type ImmediateCommandAckCommandRegistrar,
} from "@nseng-ai/pi-runtime/commands/ack";
import { notifyCommandUi } from "@nseng-ai/pi-runtime/commands/helpers";
import type {
	PiCommandContext,
	PiCommandHost,
	PiCommandRegistration,
} from "@nseng-ai/pi-runtime/runtime/command-host";
import {
	buildSkillInvocationPrompt,
	invokeRepoSkillPromptTurn,
} from "@nseng-ai/pi-runtime/skills/expansion";

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
			options: { delivery: "message" },
		});
	}
}

export default registerBackingSkillCommands;

async function handleBackingSkillCommand(options: HandleBackingSkillCommandOptions): Promise<void> {
	const { host, spec, args, ctx } = options;
	try {
		await invokeRepoSkillPromptTurn({
			host,
			ctx,
			skillName: spec.skillName,
			successMessage: `Invoking ${spec.skillName}${args.trim().length > 0 ? " with initial context" : ""}.`,
			buildPrompt: (skillBlock) => buildBackingSkillPrompt(spec, skillBlock, args),
		});
	} catch (error) {
		notifyCommandUi(ctx, formatErrorMessage(error), "error");
	}
}

function buildBackingSkillPrompt(spec: DerivedPiCommand, skillBlock: string, args: string): string {
	return buildSkillInvocationPrompt({
		skillName: spec.skillName,
		initialRequest: args,
		skillBlock,
	});
}
