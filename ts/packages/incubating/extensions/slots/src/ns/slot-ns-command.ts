import {
	defineCommand,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@nseng-ai/sdk";

import { checkoutBranchesCompletionProviderFor } from "./checkout-completion.ts";
import {
	adaptSlotCompletionProvider,
	createSlotCliContext,
	toModernSlotOutcome,
} from "./command-adapter.ts";
import { buildNsShellCommands } from "./shell-commands.ts";
import {
	slotCommandBaseSpec,
	slotCommandSpecs,
	type SlotCommandSpec,
} from "./slot-command-specs.ts";

export function loadSlotNsCommand(commandName: string): NsCommand {
	const spec = slotCommandSpecs.find((candidate) => candidate.name === commandName);
	if (spec !== undefined) return slotCommandFromSpec(spec);
	const shellCommand =
		buildNsShellCommands()[commandName === "show" ? 0 : commandName === "install" ? 1 : -1];
	if (shellCommand !== undefined) return shellCommand;
	throw new Error(`Missing Slot ns command ${commandName}.`);
}

function slotCommandFromSpec(spec: SlotCommandSpec): NsCommand<NsCommandSchema, unknown> {
	const completionProvider = adaptSlotCompletionProvider(
		checkoutBranchesCompletionProviderFor({
			completionKind: spec.completionKind,
			gitFromContext: async (ctx: NsExtensionApi) => (await createSlotCliContext(ctx)).git,
		}),
	);
	const base = slotCommandBaseSpec(spec);
	return defineCommand({
		...base,
		...(completionProvider === undefined ? {} : { completionProvider }),
		handler: async (ctx, request) =>
			toModernSlotOutcome(await base.handler(await createSlotCliContext(ctx), request)),
	});
}
