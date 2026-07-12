import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/sdk";

import type { ReviewsRuntime } from "../core/context.ts";
import { createNsReviewsRuntime } from "./context.ts";

type ReviewsNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, ReviewsRuntime>,
	"createContext"
>;

export function reviewsNsCommand<S extends NsCommandSchema, T>(
	options: ReviewsNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createNsReviewsRuntime,
	});
}
