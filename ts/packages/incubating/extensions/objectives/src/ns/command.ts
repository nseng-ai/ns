import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/extension-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/sdk";

import type { ObjectiveCliContext } from "../core/context.ts";
import { createNsObjectiveContext } from "./context.ts";

type ObjectiveNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, ObjectiveCliContext>,
	"createContext"
>;

export function objectiveNsCommand<S extends NsCommandSchema, T>(
	options: ObjectiveNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createNsObjectiveContext,
	});
}
