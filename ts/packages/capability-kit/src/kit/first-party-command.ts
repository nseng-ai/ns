import {
	clinkr,
	defineCommand,
	type ClinkrCompletionBundle,
	type ClinkrHandlerBundle,
	type ClinkrRun,
	type ClinkrSpec,
	type CommandCompletionProvider,
	type CommandSchema,
	type DefinedCommand,
} from "@nseng-ai/sdk/command";
import type { DescriptorCommand } from "@nseng-ai/sdk";
import type { z } from "zod";

import type { FirstPartyCommandContext } from "./command-context.ts";

export interface FirstPartyClinkrSpec<S extends CommandSchema, TResult> extends Omit<
	ClinkrSpec<S, TResult>,
	"handler" | "completions"
> {
	readonly completions?: (
		context: FirstPartyCommandContext,
		bundle: ClinkrCompletionBundle,
		request: Parameters<CommandCompletionProvider>[1],
	) => ReturnType<CommandCompletionProvider>;
	readonly handler: (
		context: FirstPartyCommandContext,
		bundle: ClinkrHandlerBundle,
		request: z.output<S>,
	) => ReturnType<ClinkrSpec<S, TResult>["handler"]>;
}

export interface DefineFirstPartyCommandOptions<S extends CommandSchema, TResult> {
	readonly name: string;
	readonly summary: string;
	readonly description?: string;
	readonly clinkr: FirstPartyClinkrSpec<S, TResult>;
}

const firstPartyCommandBrand = Symbol.for("@nseng-ai/capability-kit/first-party-command");

export type FirstPartyCommandDefinition<S extends CommandSchema, TResult> = DefinedCommand<
	ClinkrRun<S, TResult>
> & {
	readonly [firstPartyCommandBrand]: FirstPartyClinkrSpec<S, TResult>;
};

export function defineFirstPartyCommand<S extends CommandSchema, TResult>(
	options: DefineFirstPartyCommandOptions<S, TResult>,
): FirstPartyCommandDefinition<S, TResult> {
	const { completions: _completions, ...publicSpec } = options.clinkr;
	const unavailableRun = clinkr({
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
		{ [firstPartyCommandBrand]: options.clinkr },
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
		run: clinkr({
			...publicSpec,
			...(completions === undefined
				? {}
				: { completions: (bundle, request) => completions(context, bundle, request) }),
			handler: (bundle, request) => spec.handler(context, bundle, request),
		}),
	});
}
