import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
	type ResultOf,
} from "@nseng-ai/sdk";
import type { z } from "zod";

import type { ReviewsRuntime } from "../core/context.ts";
import { createNsReviewsRuntime } from "./context.ts";

type ReviewsNsCommandOptions<S extends NsCommandSchema, TResultSchema extends z.ZodType> = Omit<
	DefineCommandSpec<S, TResultSchema>,
	"handler"
> & {
	readonly handler: (
		runtime: ReviewsRuntime,
		request: z.output<S>,
	) => CommandExit<ResultOf<TResultSchema>> | Promise<CommandExit<ResultOf<TResultSchema>>>;
};

export function reviewsNsCommand<S extends NsCommandSchema, TResultSchema extends z.ZodType>(
	options: ReviewsNsCommandOptions<S, TResultSchema>,
): NsCommand<S, TResultSchema> {
	return defineCommand({
		...options,
		handler: async (ctx, request) => await options.handler(createNsReviewsRuntime(ctx), request),
	});
}
