import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@sdl/capability-kit/sdl-command";
import type { SdlCommand, SdlCommandSchema } from "@sdl/kernel/sdk";

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
