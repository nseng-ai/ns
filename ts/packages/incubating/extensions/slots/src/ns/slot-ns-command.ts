import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	defineCommand,
	type CommandExit,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@nseng-ai/sdk";

import { createRealSlotContext, type SlotCliContext } from "../core/context.ts";
import { checkoutBranchesCompletionProviderFor } from "./checkout-completion.ts";
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

async function createSlotExtensionContext(ctx: NsExtensionApi): Promise<SlotCliContext> {
	return await createRealSlotContext({
		cwd: ctx.cwd,
		env: ctx.env,
		commandIo: ctx.commandIo,
		renderCapabilities: ctx.renderCapabilities,
		...optionalEntry("extensions", ctx.extensions),
		shouldWriteCdDirective: true,
	});
}

function slotCommandFromSpec(spec: SlotCommandSpec): NsCommand<NsCommandSchema, unknown> {
	const completionProvider = checkoutBranchesCompletionProviderFor({
		completionKind: spec.completionKind,
		gitFromContext: async (ctx: NsExtensionApi) => (await createSlotExtensionContext(ctx)).git,
	});
	const base = slotCommandBaseSpec(spec);
	return defineCommand({
		...base,
		...(completionProvider === undefined
			? {}
			: {
					completionProvider: async (ctx, request) =>
						(await completionProvider(ctx, request)).candidates,
				}),
		handler: async (ctx, request) =>
			toModernOutcome(await base.handler(await createSlotExtensionContext(ctx), request)),
	});
}

function toModernOutcome<T>(value: unknown): CommandExit<T> {
	if (typeof value !== "object" || value === null || !("type" in value)) {
		throw new Error("Slot command returned an invalid outcome.");
	}
	const legacy = value as Record<string, unknown>;
	if (legacy.type === "ok") return { status: "success", data: legacy.data as T };
	if (legacy.type === "negative") {
		return {
			status: "negative",
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	if (legacy.type === "failure") {
		return {
			status: "failure",
			errorType: String(legacy.errorType),
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	return {
		status: "usage-error",
		errorType: "usage-error",
		message: String(legacy.message),
		...optionalEntry("data", legacy.data),
	};
}
