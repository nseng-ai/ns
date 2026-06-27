import type {
	ClinkrExit,
	RenderCapabilities,
	SdlCommand,
	SdlCommandSchema,
	SdlExtensionApi,
} from "sdl-sdk";
import type { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { createSdlObjectiveContext } from "./context.ts";

interface ObjectiveSdlCommandOptions<S extends SdlCommandSchema, T> {
	name: string;
	summary: string;
	description: string;
	schema: S;
	resultSchema: z.ZodType<T>;
	positionals?: SdlCommand<S, T>["positionals"] | undefined;
	renderHuman?: ((data: T, caps: RenderCapabilities) => string) | undefined;
	renderMarkdown?: ((data: T, caps: RenderCapabilities) => string) | undefined;
	handler(ctx: ObjectiveCliContext, request: z.output<S>): Promise<ClinkrExit<T>>;
}

export function objectiveSdlCommand<S extends SdlCommandSchema, T>(
	options: ObjectiveSdlCommandOptions<S, T>,
): SdlCommand<S, T> {
	return {
		name: options.name,
		summary: options.summary,
		description: options.description,
		schema: options.schema,
		resultSchema: options.resultSchema,
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
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
			return await options.handler(await createSdlObjectiveContext(ctx), request);
		},
	};
}
