import type { ClinkrDynamicCompletionProvider } from "../completion.ts";
import type { RawCommandSpec } from "../group.ts";

export type { RawCommandInvocation, RawCommandSpec } from "../group.ts";

export interface RawCommandOptions<TContext> {
	name: string;
	description?: string;
	summary?: string;
	helpGroup?: string;
	aliases?: readonly string[];
	isHidden?: boolean;
	completionProvider?: ClinkrDynamicCompletionProvider<TContext>;
	/** Receives the raw post-route argv tail and owns output bytes and exit status. */
	run: RawCommandSpec<TContext>["run"];
}

/**
 * Defines the narrow raw-execution escape hatch for passthrough and byte-owning commands.
 * Clinkr selects the command, then leaves its argv tail, output, and exit status to the handler.
 */
export function rawCommand<TContext>(
	options: RawCommandOptions<TContext>,
): RawCommandSpec<TContext> {
	return { ...options, isRawExit: true };
}
