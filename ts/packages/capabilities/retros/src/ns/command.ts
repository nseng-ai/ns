import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/sdk";

import type { RetrosCliContext } from "../context.ts";
import { createNsRetrosContext } from "./context.ts";

type RetrosNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, RetrosCliContext>,
	"createContext"
>;

export function retrosNsCommand<S extends NsCommandSchema, T>(
	options: RetrosNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createNsRetrosContext,
	});
}
