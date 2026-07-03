import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@ji/capability-kit/ji-command";
import type { SdlCommand, SdlCommandSchema } from "@ji/kernel/sdk";

import type { HandoffCliContext } from "../core/context.ts";
import { createSdlHandoffContext } from "./context.ts";

type HandoffSdlCommandOptions<S extends SdlCommandSchema, T> = Omit<
	SdlDomainCommandOptions<S, T, HandoffCliContext>,
	"createContext"
>;

export function handoffSdlCommand<S extends SdlCommandSchema, T>(
	options: HandoffSdlCommandOptions<S, T>,
): SdlCommand<S, T> {
	return createSdlDomainCommand({
		...options,
		createContext: createSdlHandoffContext,
	});
}
