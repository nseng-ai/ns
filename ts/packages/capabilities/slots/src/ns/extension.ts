import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import {
	type NsCommand,
	type NsExtension,
	type NsCommandCompletionProvider,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@nseng-ai/kernel/sdk";

import { createRealSlotContext, type SlotCliContext } from "../core/context.ts";
import { completeCheckoutBranchesFromGit } from "./checkout-completion.ts";
import { buildNsShellCommands } from "./shell-commands.ts";
import { slotCommandSpecs, type SlotCommandSpec } from "./slot-command-specs.ts";

type SlotNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, SlotCliContext>,
	"createContext"
>;

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
	const completionProvider = completionProviderFor(spec);
	return slotCommand({
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		schema: spec.schema,
		resultSchema: spec.resultSchema,
		...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
		...(spec.options === undefined ? {} : { options: spec.options }),
		...(completionProvider === undefined ? {} : { completionProvider }),
		...(spec.renderHuman === undefined ? {} : { renderHuman: spec.renderHuman }),
		...(spec.renderMarkdown === undefined ? {} : { renderMarkdown: spec.renderMarkdown }),
		handler: spec.handler,
	});
}

function completionProviderFor(spec: SlotCommandSpec): NsCommandCompletionProvider | undefined {
	if (spec.completionKind !== "checkout-branches") return undefined;
	return async (ctx, request) => {
		const slotContext = await createSlotExtensionContext(ctx);
		return await completeCheckoutBranchesFromGit(slotContext.git, request);
	};
}

const extension = {
	commands: [
		...slotCommandSpecs.map((spec) => slotCommandFromSpec(spec)),
		...buildNsShellCommands(),
	],
} satisfies NsExtension;

export default extension;
