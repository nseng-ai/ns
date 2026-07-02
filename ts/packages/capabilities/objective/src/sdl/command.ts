import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@sdl/capability-kit/sdl-command";
import type { SdlCommand, SdlCommandSchema } from "@sdl/kernel/sdk";

import type { ObjectiveCliContext } from "../core/context.ts";
import { createSdlObjectiveContext } from "./context.ts";

type ObjectiveSdlCommandOptions<S extends SdlCommandSchema, T> = Omit<
	SdlDomainCommandOptions<S, T, ObjectiveCliContext>,
	"createContext"
>;

export function objectiveSdlCommand<S extends SdlCommandSchema, T>(
	options: ObjectiveSdlCommandOptions<S, T>,
): SdlCommand<S, T> {
	return createSdlDomainCommand({
		...options,
		createContext: createSdlObjectiveContext,
	});
}
