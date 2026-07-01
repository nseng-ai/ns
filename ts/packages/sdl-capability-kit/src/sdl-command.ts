import type {
	ClinkrExit,
	RenderCapabilities,
	SdlCommand,
	SdlCommandSchema,
	SdlExtensionApi,
} from "sdl-sdk";
import type { z } from "zod";

export interface SdlDomainCommandOptions<S extends SdlCommandSchema, T, TContext> {
	name: string;
	summary: string;
	description: string;
	schema: S;
	resultSchema: z.ZodType<T>;
	positionals?: SdlCommand<S, T>["positionals"];
	completionProvider?: SdlCommand<S, T>["completionProvider"];
	renderHuman?: (data: T, caps: RenderCapabilities) => string;
	renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	createContext(ctx: SdlExtensionApi): Promise<TContext> | TContext;
	handler(ctx: TContext, request: z.output<S>): Promise<ClinkrExit<T>> | ClinkrExit<T>;
}

export function createSdlDomainCommand<S extends SdlCommandSchema, T, TContext>(
	options: SdlDomainCommandOptions<S, T, TContext>,
): SdlCommand<S, T> {
	return {
		name: options.name,
		summary: options.summary,
		description: options.description,
		schema: options.schema,
		resultSchema: options.resultSchema,
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
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
		run: async (ctx: SdlExtensionApi, request: z.output<S>) => {
			const domainContext = await options.createContext(ctx);
			return await options.handler(domainContext, request);
		},
	};
}
