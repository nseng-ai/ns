import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type RenderCapabilities,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
	type ResultOf,
} from "@nseng-ai/sdk";
import type { z } from "zod";

export interface NsDomainCommandOptions<
	S extends NsCommandSchema,
	TResultSchema extends z.ZodType,
	TContext,
> {
	name: string;
	summary: string;
	description: string;
	schema: S;
	resultSchema: TResultSchema;
	positionals?: DefineCommandSpec<S, TResultSchema>["positionals"];
	options?: DefineCommandSpec<S, TResultSchema>["options"];
	completionProvider?: DefineCommandSpec<S, TResultSchema>["completionProvider"];
	renderHuman: (data: ResultOf<TResultSchema>, caps: RenderCapabilities) => string;
	renderMarkdown?: (data: ResultOf<TResultSchema>, caps: RenderCapabilities) => string;
	createContext(ctx: NsExtensionApi): Promise<TContext> | TContext;
	handler(
		ctx: TContext,
		request: z.output<S>,
	): Promise<CommandExit<ResultOf<TResultSchema>>> | CommandExit<ResultOf<TResultSchema>>;
}

export function createNsDomainCommand<
	S extends NsCommandSchema,
	TResultSchema extends z.ZodType,
	TContext,
>(options: NsDomainCommandOptions<S, TResultSchema, TContext>): NsCommand<S, TResultSchema> {
	return defineCommand({
		name: options.name,
		summary: options.summary,
		description: options.description,
		schema: options.schema,
		resultSchema: options.resultSchema,
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
		...(options.options === undefined ? {} : { options: options.options }),
		...(options.completionProvider === undefined
			? {}
			: { completionProvider: options.completionProvider }),
		renderHuman: options.renderHuman,
		...(options.renderMarkdown === undefined ? {} : { renderMarkdown: options.renderMarkdown }),
		handler: async (ctx: NsExtensionApi, request: z.output<S>) => {
			const domainContext = await options.createContext(ctx);
			return await options.handler(domainContext, request);
		},
	});
}
