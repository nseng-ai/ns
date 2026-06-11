import type { z } from "zod";

import { ok, type ClinkrExit } from "../exit.ts";
import type { ClinkrCommandSpec } from "../group.ts";
import type { PositionalSpec } from "../surface.ts";

export interface RawCommandOptions<TContext, S extends z.ZodObject> {
	name: string;
	description?: string;
	summary?: string;
	schema: S;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	run: (ctx: TContext, request: z.output<S>) => Promise<number>;
}

/**
 * Factory for raw-exit commands. Wraps a handler that returns a process exit
 * code directly into a ClinkrCommandSpec with `isRawExit: true`. No framework
 * bytes are emitted; all output is handler-owned. Exit codes pass through
 * directly; non-number data throws an invariant error.
 */
export function rawCommand<TContext, S extends z.ZodObject>(
	options: RawCommandOptions<TContext, S>,
): ClinkrCommandSpec<TContext, S, number> {
	return {
		name: options.name,
		...(options.description === undefined ? {} : { description: options.description }),
		...(options.summary === undefined ? {} : { summary: options.summary }),
		schema: options.schema,
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
		handler: async (ctx: TContext, request: z.output<S>): Promise<ClinkrExit<number>> => {
			const exitCode = await options.run(ctx, request);
			return ok(exitCode);
		},
		isRawExit: true,
	};
}
