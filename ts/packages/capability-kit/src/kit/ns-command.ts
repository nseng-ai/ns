import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type RenderCapabilities,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@nseng-ai/kernel/sdk";
import type { z } from "zod";

export interface NsDomainCommandOptions<S extends NsCommandSchema, T, TContext> {
	name: string;
	summary: string;
	description: string;
	schema: S;
	resultSchema: z.ZodType<T>;
	positionals?: DefineCommandSpec<S, T>["positionals"];
	options?: DefineCommandSpec<S, T>["options"];
	completionProvider?: DefineCommandSpec<S, T>["completionProvider"];
	renderHuman?: (data: T, caps: RenderCapabilities) => string;
	renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	createContext(ctx: NsExtensionApi): Promise<TContext> | TContext;
	handler(ctx: TContext, request: z.output<S>): Promise<CommandExit<T>> | CommandExit<T>;
}

export function createNsDomainCommand<S extends NsCommandSchema, T, TContext>(
	options: NsDomainCommandOptions<S, T, TContext>,
): NsCommand<S, T> {
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
		...(options.renderHuman === undefined ? {} : { renderHuman: options.renderHuman }),
		...(options.renderMarkdown === undefined ? {} : { renderMarkdown: options.renderMarkdown }),
		handler: async (ctx: NsExtensionApi, request: z.output<S>) => {
			const domainContext = await options.createContext(ctx);
			return await options.handler(domainContext, request);
		},
	});
}
