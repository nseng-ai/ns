import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
	type ResultOf,
} from "@nseng-ai/sdk";
import type { z } from "zod";

import type { HandoffCliContext } from "../core/context.ts";
import { createNsHandoffContext } from "./context.ts";

type HandoffNsCommandOptions<S extends NsCommandSchema, TResultSchema extends z.ZodType> = Omit<
	DefineCommandSpec<S, TResultSchema>,
	"handler"
> & {
	readonly handler: (ctx: HandoffCliContext, request: z.output<S>) => Promise<unknown> | unknown;
};

export function handoffNsCommand<S extends NsCommandSchema, TResultSchema extends z.ZodType>(
	options: HandoffNsCommandOptions<S, TResultSchema>,
): NsCommand<S, TResultSchema> {
	return defineCommand({
		...options,
		handler: async (ctx, request) =>
			toModernOutcome<ResultOf<TResultSchema>>(
				await options.handler(await createNsHandoffContext(ctx), request),
			),
	});
}

function toModernOutcome<T>(value: unknown): CommandExit<T> {
	if (typeof value !== "object" || value === null || !("type" in value)) {
		throw new Error("Handoff command returned an invalid outcome.");
	}
	const legacy = value as Record<string, unknown>;
	if (legacy.type === "ok") return { status: "success", data: legacy.data as T };
	if (legacy.type === "negative") {
		return {
			status: "negative",
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	if (legacy.type === "failure") {
		return {
			status: "failure",
			errorType: String(legacy.errorType),
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	return {
		status: "usage-error",
		errorType: "usage-error",
		message: String(legacy.message),
		...optionalEntry("data", legacy.data),
	};
}
