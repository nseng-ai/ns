// Legacy-independent raw command definition for the quarantined `src/app/`
// runtime. This module must not import legacy runtime modules (`group.ts`,
// `exit.ts`, `emit.ts`, `completion.ts`) and has no I/O seam at all; the app
// runtime imports it directly so raw definitions share the structured loader
// without touching the legacy surface that `src/raw/index.ts` still
// re-exports.

/**
 * Invocation payload for a context-free raw command. `argv` is the selected
 * command's argv tail, passed through verbatim (including framework-looking
 * flags such as `--format` and `--`); the raw command owns all tail
 * interpretation and its exit status. Raw commands are terminal-only by
 * construction: they write their output bytes directly to `process.stdout`
 * and `process.stderr` and read `process.stdin` themselves when needed.
 */
export interface RawCommandInvocation {
	readonly argv: readonly string[];
}

/** Invocation payload for a contextful raw command. */
export interface ContextfulRawCommandInvocation<TContext> extends RawCommandInvocation {
	readonly context: TContext;
}

type RawRunResult = number | Promise<number>;

/** Author-facing input to {@link defineRawCommand} for a context-free raw command. */
export interface ContextFreeRawCommandOptions {
	readonly requiresContext?: false;
	readonly run: (invocation: RawCommandInvocation) => RawRunResult;
}

/** Author-facing input to {@link defineRawCommand} for a contextful raw command. */
export interface ContextfulRawCommandOptions<TContext> {
	readonly requiresContext: true;
	readonly run: (invocation: ContextfulRawCommandInvocation<TContext>) => RawRunResult;
}

export interface ContextFreeRawCommandDefinition extends ContextFreeRawCommandOptions {
	readonly type: "raw";
}

export interface ContextfulRawCommandDefinition<
	TContext,
> extends ContextfulRawCommandOptions<TContext> {
	readonly type: "raw";
}

export type ClinkrRawCommandDefinition<TContext = never> =
	| ContextFreeRawCommandDefinition
	| ContextfulRawCommandDefinition<TContext>;

/**
 * Constructor for raw command definitions. A raw filesystem command keeps the
 * standard selected-module `command()` export and returns this definition;
 * the numeric result is the process exit status, returned unchanged. The
 * `type: "raw"` discriminant is constructor-owned: it is how the selected
 * definition decoder distinguishes raw from structured definitions without
 * inspecting incidental members. Raw definitions cannot declare structured
 * members (`schema`, `resultSchema`, handlers, renderers, completion
 * providers); the decoder rejects unknown keys.
 */
export function defineRawCommand(
	definition: ContextFreeRawCommandOptions,
): ContextFreeRawCommandDefinition;
export function defineRawCommand<TContext>(
	definition: ContextfulRawCommandOptions<TContext>,
): ContextfulRawCommandDefinition<TContext>;
export function defineRawCommand<TContext>(
	definition: ContextFreeRawCommandOptions | ContextfulRawCommandOptions<TContext>,
): ClinkrRawCommandDefinition<TContext> {
	return { ...definition, type: "raw" };
}
