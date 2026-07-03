import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@ji/capability-kit/ji-command";
import type { SdlCommand, SdlCommandSchema } from "@ji/kernel/sdk";

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
