import type { z } from "zod";

import type { ClinkrDynamicCompletionProvider } from "../completion.ts";
import type { RawCommandSpec } from "../group.ts";
import type { OptionSpec, PositionalSpec } from "../surface.ts";

export type { RawCommandSpec } from "../group.ts";
export type { OptionSpec, PositionalSpec } from "../surface.ts";

// New quarantined-runtime raw definition surface. The definition module is
// legacy-independent so `src/app/` can import it without pulling in the
// legacy `group.ts`/`completion.ts` types re-exported above.
export { defineRawCommand } from "./definition.ts";
export type {
	ClinkrRawCommandDefinition,
	ContextFreeRawCommandDefinition,
	ContextFreeRawCommandOptions,
	ContextfulRawCommandDefinition,
	ContextfulRawCommandInvocation,
	ContextfulRawCommandOptions,
	RawCommandInvocation,
} from "./definition.ts";

export interface RawCommandOptions<TContext, S extends z.ZodObject> {
	name: string;
	description?: string;
	summary?: string;
	schema: S;
	shouldPassThrough?: true;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	completionProvider?: ClinkrDynamicCompletionProvider<TContext>;
	run: (ctx: TContext, request: z.output<S>) => Promise<number>;
}

/**
 * Factory for raw-exit commands. Brands a raw process-exit-code handler with
 * `isRawExit: true` so callers declare raw byte/exit ownership via the
 * `@nseng-ai/clinkr/raw` subpath. No framework bytes are emitted; all output is
 * handler-owned and exit codes pass through directly.
 */
export function rawCommand<TContext, S extends z.ZodObject>(
	options: RawCommandOptions<TContext, S>,
): RawCommandSpec<TContext, S> {
	return { ...options, isRawExit: true };
}
