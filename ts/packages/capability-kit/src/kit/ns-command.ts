import type {
	ClinkrExit,
	RenderCapabilities,
	NsCommand,
	NsCommandSchema,
	NsExtensionApi,
} from "@nseng-ai/ns/kernel/sdk";
import type { z } from "zod";

export interface NsDomainCommandOptions<S extends NsCommandSchema, T, TContext> {
	name: string;
	summary: string;
	description: string;
	schema: S;
	resultSchema: z.ZodType<T>;
	positionals?: NsCommand<S, T>["positionals"];
	options?: NsCommand<S, T>["options"];
	completionProvider?: NsCommand<S, T>["completionProvider"];
	renderHuman?: (data: T, caps: RenderCapabilities) => string;
	renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	createContext(ctx: NsExtensionApi): Promise<TContext> | TContext;
	handler(ctx: TContext, request: z.output<S>): Promise<ClinkrExit<T>> | ClinkrExit<T>;
}

export function createNsDomainCommand<S extends NsCommandSchema, T, TContext>(
	options: NsDomainCommandOptions<S, T, TContext>,
): NsCommand<S, T> {
	return {
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
		...(options.renderHuman === undefined
			? {}
			: {
					renderHuman: (data: unknown, caps: RenderCapabilities) =>
						options.renderHuman?.(options.resultSchema.parse(data), caps) ?? "",
				}),
		...(options.renderMarkdown === undefined
			? {}
			: {
					renderMarkdown: (data: unknown, caps: RenderCapabilities) =>
						options.renderMarkdown?.(options.resultSchema.parse(data), caps) ?? "",
				}),
		run: async (ctx: NsExtensionApi, request: z.output<S>) => {
			const domainContext = await options.createContext(ctx);
			return await options.handler(domainContext, request);
		},
	};
}
