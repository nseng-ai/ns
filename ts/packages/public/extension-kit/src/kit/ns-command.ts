import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@nseng-ai/sdk";
import type { z } from "zod";

export interface NsDomainCommandOptions<
	S extends NsCommandSchema,
	TResult,
	TContext,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> {
	name: string;
	summary: string;
	description: string;
	schema: S;
	resultSchema?: z.ZodType<TResult>;
	negativeSchema?: z.ZodType<TNegative>;
	failureSchema?: z.ZodType<TFailure>;
	usageErrorSchema?: z.ZodType<TUsageError>;
	positionals?: DefineCommandSpec<S, TResult, TNegative, TFailure, TUsageError>["positionals"];
	options?: DefineCommandSpec<S, TResult, TNegative, TFailure, TUsageError>["options"];
	completionProvider?: DefineCommandSpec<
		S,
		TResult,
		TNegative,
		TFailure,
		TUsageError
	>["completionProvider"];
	renderHuman?: DefineCommandSpec<S, TResult, TNegative, TFailure, TUsageError>["renderHuman"];
	renderMarkdown?: DefineCommandSpec<
		S,
		TResult,
		TNegative,
		TFailure,
		TUsageError
	>["renderMarkdown"];
	createContext(ctx: NsExtensionApi): Promise<TContext> | TContext;
	handler(
		ctx: TContext,
		request: z.output<S>,
	):
		| Promise<CommandExit<TResult, TNegative, TFailure, TUsageError>>
		| CommandExit<TResult, TNegative, TFailure, TUsageError>;
}

export function createNsDomainCommand<
	S extends NsCommandSchema,
	TResult,
	TContext,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
>(
	options: NsDomainCommandOptions<S, TResult, TContext, TNegative, TFailure, TUsageError>,
): NsCommand<S, TResult, TNegative, TFailure, TUsageError> {
	return defineCommand({
		name: options.name,
		summary: options.summary,
		description: options.description,
		schema: options.schema,
		...(options.resultSchema === undefined ? {} : { resultSchema: options.resultSchema }),
		...(options.negativeSchema === undefined ? {} : { negativeSchema: options.negativeSchema }),
		...(options.failureSchema === undefined ? {} : { failureSchema: options.failureSchema }),
		...(options.usageErrorSchema === undefined
			? {}
			: { usageErrorSchema: options.usageErrorSchema }),
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
		...(options.options === undefined ? {} : { options: options.options }),
		...(options.completionProvider === undefined
			? {}
			: { completionProvider: options.completionProvider }),
		...(options.renderHuman === undefined ? {} : { renderHuman: options.renderHuman }),
		...(options.renderMarkdown === undefined ? {} : { renderMarkdown: options.renderMarkdown }),
		handler: async (ctx: NsExtensionApi, request: z.output<S>) => {
			const domainContext = await options.createContext(ctx);
			return await options.handler(domainContext, request);
		},
	});
}
