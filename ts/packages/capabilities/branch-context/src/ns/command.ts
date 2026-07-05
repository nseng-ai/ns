import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import { optionalEntry } from "@nseng-ai/core/primitives";
import type { NsCommand, NsCommandSchema, NsExtensionApi } from "@nseng-ai/kernel/sdk";

import {
	createRealBranchContextCliContext,
	type BranchContextCliContext,
} from "../core/operations.ts";

type BranchContextNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, BranchContextCliContext>,
	"createContext"
>;

export function branchContextCommand<S extends NsCommandSchema, T>(
	options: BranchContextNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createBranchContextExtensionContext,
	});
}

function createBranchContextExtensionContext(ctx: NsExtensionApi): BranchContextCliContext {
	return createRealBranchContextCliContext({
		cwd: ctx.cwd,
		env: ctx.env,
		...optionalEntry("stderr", ctx.stderr),
	});
}
