import { defineCommand, type ClinkrCommandDefinition } from "@nseng-ai/clinkr";
import type { NsCommandSchema, NsExtensionApi } from "@nseng-ai/sdk";
import type { z } from "zod";

import type { ObjectiveCliContext } from "../core/context.ts";
import { createNsObjectiveContext } from "./context.ts";

export interface ObjectiveCommandOptions<
	S extends NsCommandSchema,
	TResult,
	TContext = ObjectiveCliContext,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> extends Omit<
	ClinkrCommandDefinition<NsExtensionApi, S, TResult, TNegative, TFailure, TUsageError>,
	"handler"
> {
	readonly createContext?: (api: NsExtensionApi) => Promise<TContext> | TContext;
	readonly handler: (
		context: TContext,
		request: z.output<S>,
	) =>
		| Promise<import("@nseng-ai/clinkr").ClinkrExit<TResult, TNegative, TFailure, TUsageError>>
		| import("@nseng-ai/clinkr").ClinkrExit<TResult, TNegative, TFailure, TUsageError>;
}

/** Define an Objective command while keeping the invocation-owned ns API at the Clinkr boundary. */
export function objectiveNsCommand<
	S extends NsCommandSchema,
	TResult,
	TContext = ObjectiveCliContext,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
>(
	options: ObjectiveCommandOptions<S, TResult, TContext, TNegative, TFailure, TUsageError>,
): ClinkrCommandDefinition<NsExtensionApi, S, TResult, TNegative, TFailure, TUsageError> {
	return defineCommand({
		...options,
		handler: async (api, request) => {
			const context =
				options.createContext === undefined
					? ((await createNsObjectiveContext(api)) as TContext)
					: await options.createContext(api);
			return await options.handler(context, request);
		},
	});
}
