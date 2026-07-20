import {
	nsClinkrCommand,
	defineCommand,
	type NsClinkrCompletionBundle,
	type NsClinkrCommandBundle,
	type NsClinkrCommandRun,
	type NsClinkrCommandOptions,
	type NsClinkrCompletionProvider,
	type CommandSchema,
	type DefinedCommand,
} from "@nseng-ai/sdk/command";
import type { DescriptorCommand } from "@nseng-ai/sdk";
import type { z } from "zod";

import type { FirstPartyCommandContext } from "./command-context.ts";

export interface FirstPartyNsClinkrCommandOptions<S extends CommandSchema, TResult> extends Omit<
	NsClinkrCommandOptions<TResult, S>,
	"handler" | "completions"
> {
	readonly completions?: (
		context: FirstPartyCommandContext,
		bundle: NsClinkrCompletionBundle,
		request: Parameters<NsClinkrCompletionProvider>[1],
	) => ReturnType<NsClinkrCompletionProvider>;
	readonly handler: (
		context: FirstPartyCommandContext,
		bundle: NsClinkrCommandBundle,
		request: z.output<S>,
	) => ReturnType<NsClinkrCommandOptions<TResult, S>["handler"]>;
}

export interface DefineFirstPartyCommandOptions<S extends CommandSchema, TResult> {
	readonly name: string;
	readonly summary: string;
	readonly description?: string;
	readonly nsClinkrCommand: FirstPartyNsClinkrCommandOptions<S, TResult>;
}

const firstPartyCommandBrand = Symbol.for("@nseng-ai/capability-kit/first-party-command");

export type FirstPartyCommandDefinition<S extends CommandSchema, TResult> = DefinedCommand<
	NsClinkrCommandRun<S, TResult>
> & {
	readonly [firstPartyCommandBrand]: FirstPartyNsClinkrCommandOptions<S, TResult>;
};

export function defineFirstPartyCommand<S extends CommandSchema, TResult>(
	options: DefineFirstPartyCommandOptions<S, TResult>,
): FirstPartyCommandDefinition<S, TResult> {
	const { completions: _completions, ...publicSpec } = options.nsClinkrCommand;
	const unavailableRun = nsClinkrCommand({
		...publicSpec,
		handler: () => {
			throw new Error(`First-party command ${options.name} was not materialized by its host.`);
		},
	});
	return Object.assign(
		defineCommand({
			name: options.name,
			summary: options.summary,
			...(options.description === undefined ? {} : { description: options.description }),
			run: unavailableRun,
		}),
		{ [firstPartyCommandBrand]: options.nsClinkrCommand },
	);
}

export function materializeFirstPartyCommand(
	command: DescriptorCommand,
	context: FirstPartyCommandContext,
): DescriptorCommand {
	if (!(firstPartyCommandBrand in command)) return command;
	const definition = command as FirstPartyCommandDefinition<CommandSchema, unknown>;
	const spec = definition[firstPartyCommandBrand];
	const { completions, ...publicSpec } = spec;
	return defineCommand({
		name: definition.name,
		summary: definition.summary,
		description: definition.description,
		run: nsClinkrCommand({
			...publicSpec,
			...(completions === undefined
				? {}
				: { completions: (bundle, request) => completions(context, bundle, request) }),
			handler: (bundle, request) => spec.handler(context, bundle, request),
		}),
	});
}
