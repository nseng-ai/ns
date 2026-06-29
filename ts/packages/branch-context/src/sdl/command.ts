import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@sdl/capability-kit/sdl-command";
import type { SdlCommand, SdlCommandSchema, SdlExtensionApi } from "sdl-sdk";

import { createRealBranchContextCliContext, type BranchContextCliContext } from "../operations.ts";

type BranchContextSdlCommandOptions<S extends SdlCommandSchema, T> = Omit<
	SdlDomainCommandOptions<S, T, BranchContextCliContext>,
	"createContext"
>;

export function branchContextCommand<S extends SdlCommandSchema, T>(
	options: BranchContextSdlCommandOptions<S, T>,
): SdlCommand<S, T> {
	return createSdlDomainCommand({
		...options,
		createContext: createBranchContextExtensionContext,
	});
}

function createBranchContextExtensionContext(ctx: SdlExtensionApi): BranchContextCliContext {
	return createRealBranchContextCliContext({
		cwd: ctx.cwd,
		env: ctx.env,
		stderr: ctx.stderr,
	});
}
