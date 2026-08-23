import { defineCommand, type ClinkrCommandDefinition, type ClinkrExit } from "@nseng-ai/clinkr";
import type { NsCommandSchema, NsExtensionApi } from "@nseng-ai/sdk";
import type { z } from "zod";

import type { ObjectiveCliContext } from "../core/context.ts";
import { createNsObjectiveContext } from "./context.ts";

interface ObjectiveCommandDefinitionOptions<
	S extends NsCommandSchema,
	TResult,
	TContext,
	TNegative,
	TFailure,
	TUsageError,
> extends Omit<
	ClinkrCommandDefinition<NsExtensionApi, S, TResult, TNegative, TFailure, TUsageError>,
	"handler"
> {
	readonly handler: (
		context: TContext,
		request: z.output<S>,
	) =>
		| Promise<ClinkrExit<TResult, TNegative, TFailure, TUsageError>>
		| ClinkrExit<TResult, TNegative, TFailure, TUsageError>;
}

export type ObjectiveCommandOptions<
	S extends NsCommandSchema,
	TResult,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> = ObjectiveCommandDefinitionOptions<
	S,
	TResult,
	ObjectiveCliContext,
	TNegative,
	TFailure,
	TUsageError
>;

export type ObjectiveCommandWithContextOptions<
	S extends NsCommandSchema,
	TResult,
	TContext,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> = ObjectiveCommandDefinitionOptions<S, TResult, TContext, TNegative, TFailure, TUsageError> & {
	readonly createContext: (api: NsExtensionApi) => Promise<TContext> | TContext;
};

/** Define an Objective command while keeping the invocation-owned ns API at the Clinkr boundary. */
export function objectiveNsCommand<
	S extends NsCommandSchema,
	TResult,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
>(
	options: ObjectiveCommandOptions<S, TResult, TNegative, TFailure, TUsageError>,
): ClinkrCommandDefinition<NsExtensionApi, S, TResult, TNegative, TFailure, TUsageError> {
	return defineObjectiveCommand({ ...options, createContext: createNsObjectiveContext });
}

/** Define an Objective command whose caller provides a specialized invocation context. */
export function objectiveNsCommandWithContext<
	S extends NsCommandSchema,
	TResult,
	TContext,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
>(
	options: ObjectiveCommandWithContextOptions<
		S,
		TResult,
		TContext,
		TNegative,
		TFailure,
		TUsageError
	>,
): ClinkrCommandDefinition<NsExtensionApi, S, TResult, TNegative, TFailure, TUsageError> {
	return defineObjectiveCommand(options);
}

function defineObjectiveCommand<
	S extends NsCommandSchema,
	TResult,
	TContext,
	TNegative,
	TFailure,
	TUsageError,
>(
	options: ObjectiveCommandWithContextOptions<
		S,
		TResult,
		TContext,
		TNegative,
		TFailure,
		TUsageError
	>,
): ClinkrCommandDefinition<NsExtensionApi, S, TResult, TNegative, TFailure, TUsageError> {
	const { createContext, handler, ...definition } = options;
	return defineCommand({
		...definition,
		handler: async (api, request) => handler(await createContext(api), request),
	});
}
