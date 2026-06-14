import type { z } from "zod";

import type { RawCommandSpec } from "../group.ts";
import type { PositionalSpec } from "../surface.ts";

export type { RawCommandSpec } from "../group.ts";
export type { PositionalSpec } from "../surface.ts";

export interface RawCommandOptions<TContext, S extends z.ZodObject> {
	name: string;
	description?: string;
	summary?: string;
	schema: S;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	run: (ctx: TContext, request: z.output<S>) => Promise<number>;
}

/**
 * Factory for raw-exit commands. Brands a raw process-exit-code handler with
 * `isRawExit: true` so callers declare raw byte/exit ownership via the
 * `@asdl/clinkr/raw` subpath. No framework bytes are emitted; all output is
 * handler-owned and exit codes pass through directly.
 */
export function rawCommand<TContext, S extends z.ZodObject>(
	options: RawCommandOptions<TContext, S>,
): RawCommandSpec<TContext, S> {
	return { ...options, isRawExit: true };
}
