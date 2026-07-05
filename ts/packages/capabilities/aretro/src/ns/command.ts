import { createNsDomainCommand, type NsDomainCommandOptions } from "@ns/capability-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@ns/kernel/sdk";

import type { AretroCliContext } from "../context.ts";
import { createNsAretroContext } from "./context.ts";

type AretroNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, AretroCliContext>,
	"createContext"
>;

export function aretroNsCommand<S extends NsCommandSchema, T>(
	options: AretroNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createNsAretroContext,
	});
}
