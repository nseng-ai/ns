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
import type { SystemPromptOptions } from "@nseng-ai/pi-runtime/runtime/extension-types";
import {
	buildSkillInvocationPrompt,
	invokeEffectiveSkillPromptTurn,
} from "@nseng-ai/pi-runtime/skills/expansion";

import { genericSkillBackedCommandSpecs, type DerivedPiCommand } from "./specs.ts";

export type SkillBackedCommandContext = Pick<PiCommandContext, "hasUI" | "ui" | "waitForIdle"> & {
	getSystemPromptOptions(): SystemPromptOptions;
};

export type SkillBackedCommand = Omit<PiCommandRegistration, "handler"> & {
	handler(args: string, ctx: SkillBackedCommandContext): Promise<void> | void;
};

export type SkillBackedCommandHost = ImmediateCommandAckCommandRegistrar<SkillBackedCommand> &
	Pick<PiCommandHost, "sendUserMessage">;

interface HandleSkillBackedCommandOptions {
	host: SkillBackedCommandHost;
	spec: DerivedPiCommand;
	args: string;
	ctx: SkillBackedCommandContext;
}

export function registerSkillBackedCommands(host: SkillBackedCommandHost): void {
	for (const spec of genericSkillBackedCommandSpecs()) {
		registerCommandWithImmediateAck({
			host: host,
			commandName: spec.surface,
			commandDefinition: {
				description: `Invoke ${spec.skillName} as a skill-backed command.`,
				argumentHint: "[initial request]",
				handler: async (args, ctx) => handleSkillBackedCommand({ host, spec, args, ctx }),
			},
			options: { delivery: "message" },
		});
	}
}

export default registerSkillBackedCommands;

async function handleSkillBackedCommand(options: HandleSkillBackedCommandOptions): Promise<void> {
	const { host, spec, args, ctx } = options;
	try {
		await invokeEffectiveSkillPromptTurn({
			host,
			ctx,
			skillName: spec.skillName,
			successMessage: `Invoking ${spec.skillName}${args.trim().length > 0 ? " with initial context" : ""}.`,
			buildPrompt: (skillBlock) => buildSkillBackedPrompt(spec, skillBlock, args),
		});
	} catch (error) {
		notifyCommandUi(ctx, formatErrorMessage(error), "error");
	}
}

function buildSkillBackedPrompt(spec: DerivedPiCommand, skillBlock: string, args: string): string {
	return buildSkillInvocationPrompt({
		skillName: spec.skillName,
		initialRequest: args,
		skillBlock,
	});
}
