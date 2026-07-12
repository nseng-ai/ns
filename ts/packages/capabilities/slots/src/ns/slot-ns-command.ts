import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import type {
	NsCommand,
	NsCommandCompletionProvider,
	NsCommandSchema,
	NsExtensionApi,
} from "@nseng-ai/sdk/sdk";

import { createRealSlotContext, type SlotCliContext } from "../core/context.ts";
import { checkoutBranchesCompletionProviderFor } from "./checkout-completion.ts";
import { buildNsShellCommands } from "./shell-commands.ts";
import {
	slotCommandBaseSpec,
	slotCommandSpecs,
	type SlotCommandSpec,
} from "./slot-command-specs.ts";

type SlotNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, SlotCliContext>,
	"createContext"
>;

export function loadSlotNsCommand(commandName: string): NsCommand {
	const command = allSlotNsCommands().find((candidate) => candidate.name === commandName);
	if (command === undefined) {
		throw new Error(`Missing Slot ns command ${commandName}.`);
	}
	return command;
}

function allSlotNsCommands(): readonly NsCommand[] {
	return [...slotCommandSpecs.map((spec) => slotCommandFromSpec(spec)), ...buildNsShellCommands()];
}

function slotCommand<S extends NsCommandSchema, T>(
	options: SlotNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createSlotExtensionContext,
	});
}

async function createSlotExtensionContext(ctx: NsExtensionApi): Promise<SlotCliContext> {
	return await createRealSlotContext({
		cwd: ctx.cwd,
		env: ctx.env,
		...optionalEntry("stderr", ctx.stderr),
		renderCapabilities: ctx.renderCapabilities,
		...optionalEntry("extensions", ctx.extensions),
		shouldWriteCdDirective: true,
	});
}

function slotCommandFromSpec(spec: SlotCommandSpec): NsCommand<NsCommandSchema, unknown> {
	const completionProvider: NsCommandCompletionProvider | undefined =
		checkoutBranchesCompletionProviderFor({
			completionKind: spec.completionKind,
			gitFromContext: async (ctx: NsExtensionApi) => (await createSlotExtensionContext(ctx)).git,
		});
	return slotCommand({
		...slotCommandBaseSpec(spec),
		...optionalEntry("completionProvider", completionProvider),
	});
}
