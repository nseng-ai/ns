import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/sdk/sdk";

import type { HandoffCliContext } from "../core/context.ts";
import { createNsHandoffContext } from "./context.ts";

type HandoffNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, HandoffCliContext>,
	"createContext"
>;

export function handoffNsCommand<S extends NsCommandSchema, T>(
	options: HandoffNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createNsHandoffContext,
	});
}
