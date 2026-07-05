import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/kernel/sdk";

import type { RoasterRuntime } from "../core/context.ts";
import { createNsRoasterRuntime } from "./context.ts";

type RoasterNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, RoasterRuntime>,
	"createContext"
>;

export function roasterNsCommand<S extends NsCommandSchema, T>(
	options: RoasterNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createNsRoasterRuntime,
	});
}
