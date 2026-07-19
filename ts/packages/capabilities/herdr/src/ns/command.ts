import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/sdk";

import { createNsHerdrHandoffTabContext, type HerdrHandoffTabContext } from "./context.ts";

type HerdrNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, HerdrHandoffTabContext>,
	"createContext"
>;

export function herdrNsCommand<S extends NsCommandSchema, T>(
	options: HerdrNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createNsHerdrHandoffTabContext,
	});
}
