import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@nseng-ai/sdk";
import type { z } from "zod";

import type { ObjectiveCliContext } from "../core/context.ts";
import { createNsObjectiveContext } from "./context.ts";

type ObjectiveCommandOptions<S extends NsCommandSchema, T, TContext> = Omit<
	DefineCommandSpec<S, T>,
	"handler"
> & {
	readonly createContext: (api: NsExtensionApi) => Promise<TContext> | TContext;
	readonly handler: (context: TContext, request: z.output<S>) => Promise<unknown> | unknown;
};

type DefaultObjectiveCommandOptions<S extends NsCommandSchema, T> = Omit<
	ObjectiveCommandOptions<S, T, ObjectiveCliContext>,
	"createContext"
>;

export function objectiveNsCommand<S extends NsCommandSchema, T>(
	options: DefaultObjectiveCommandOptions<S, T>,
): NsCommand<S, T> {
	return defineObjectiveCommand({ ...options, createContext: createNsObjectiveContext });
}

export function objectiveNsCommandWithContext<S extends NsCommandSchema, T, TContext>(
	options: ObjectiveCommandOptions<S, T, TContext>,
): NsCommand<S, T> {
	return defineObjectiveCommand(options);
}

function defineObjectiveCommand<S extends NsCommandSchema, T, TContext>(
	options: ObjectiveCommandOptions<S, T, TContext>,
): NsCommand<S, T> {
	const { createContext, handler, ...definition } = options;
	return defineCommand({
		...definition,
		handler: async (api, request) =>
			toModernOutcome<T>(await handler(await createContext(api), request)),
	});
}

function toModernOutcome<T>(value: unknown): CommandExit<T> {
	if (typeof value !== "object" || value === null || !("type" in value)) {
		throw new Error("Objective command returned an invalid outcome.");
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
