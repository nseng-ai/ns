import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@sdl/capability-kit/sdl-command";
import type { SdlCommand, SdlCommandSchema } from "sdl-sdk";

import type { RoasterRuntime } from "../context.ts";
import { createSdlRoasterRuntime } from "./context.ts";

type RoasterSdlCommandOptions<S extends SdlCommandSchema, T> = Omit<
	SdlDomainCommandOptions<S, T, RoasterRuntime>,
	"createContext"
>;

export function roasterSdlCommand<S extends SdlCommandSchema, T>(
	options: RoasterSdlCommandOptions<S, T>,
): SdlCommand<S, T> {
	return createSdlDomainCommand({
		...options,
		createContext: createSdlRoasterRuntime,
	});
}
