import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/extension-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/sdk";

import { createNsHerdrHandoffTabContext, type HerdrHandoffTabContext } from "./context.ts";

type HerdrNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, HerdrHandoffTabContext, unknown, unknown, unknown>,
	"createContext"
>;

export function herdrNsCommand<S extends NsCommandSchema, T>(
	options: HerdrNsCommandOptions<S, T>,
): NsCommand<S, T, unknown, unknown, unknown> {
	return createNsDomainCommand({
		...options,
		createContext: createNsHerdrHandoffTabContext,
	});
}
