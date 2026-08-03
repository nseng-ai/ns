import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
} from "@nseng-ai/sdk";
import type { z } from "zod";

import type { ReviewsRuntime } from "../core/context.ts";
import { createNsReviewsRuntime } from "./context.ts";

type ReviewsNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	DefineCommandSpec<S, T>,
	"handler"
> & {
	readonly handler: (
		runtime: ReviewsRuntime,
		request: z.output<S>,
	) => CommandExit<T> | Promise<CommandExit<T>>;
};

export function reviewsNsCommand<S extends NsCommandSchema, T>(
	options: ReviewsNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return defineCommand({
		...options,
		handler: async (ctx, request) => await options.handler(createNsReviewsRuntime(ctx), request),
	});
}
