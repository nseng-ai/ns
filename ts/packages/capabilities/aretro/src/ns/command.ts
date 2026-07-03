import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@ns/capability-kit/ns-command";
import type { SdlCommand, SdlCommandSchema } from "@ns/kernel/sdk";

import type { AretroCliContext } from "../context.ts";
import { createSdlAretroContext } from "./context.ts";

type AretroSdlCommandOptions<S extends SdlCommandSchema, T> = Omit<
	SdlDomainCommandOptions<S, T, AretroCliContext>,
	"createContext"
>;

export function aretroSdlCommand<S extends SdlCommandSchema, T>(
	options: AretroSdlCommandOptions<S, T>,
): SdlCommand<S, T> {
	return createSdlDomainCommand({
		...options,
		createContext: createSdlAretroContext,
	});
}
