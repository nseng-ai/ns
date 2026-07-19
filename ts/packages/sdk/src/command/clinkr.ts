import type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrFormat,
	OptionSpec,
	RenderCapabilities,
} from "@nseng-ai/clinkr";
import type { PositionalSpec } from "@nseng-ai/clinkr/raw";
import type { z } from "zod";

import type { NsContext } from "./catalog.ts";
import { hostable, type HostableBundle, type HostableRun } from "./hostable.ts";
import type { CommandExit } from "../sdk/result.ts";

export type CommandSchema = z.ZodObject;

export interface ClinkrHandlerBundle<TContext> extends HostableBundle {
	readonly context: TContext;
	readonly ns: NsContext;
	readonly caps: RenderCapabilities;
	readonly format?: ClinkrFormat;
}

export type CommandCompletionProvider<TContext> = (
	context: TContext,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

export interface ClinkrSpec<TContext, S extends CommandSchema, TResult> {
	readonly schema: S;
	readonly resultSchema: z.ZodType<TResult>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (data: TResult, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: TResult, caps: RenderCapabilities) => string;
	readonly completions?: CommandCompletionProvider<TContext>;
	readonly handler: (
		bundle: ClinkrHandlerBundle<TContext>,
		request: z.output<S>,
	) => Promise<CommandExit<TResult>> | CommandExit<TResult>;
}

const clinkrRunBrand = Symbol.for("@nseng-ai/sdk/command/clinkr");

export interface ClinkrRun<TContext, S extends CommandSchema, TResult> extends HostableRun<
	ClinkrHandlerBundle<TContext>,
	z.output<S>,
	CommandExit<TResult>
> {
	readonly [clinkrRunBrand]: ClinkrSpec<TContext, S, TResult>;
}

export function clinkr<TContext, S extends CommandSchema, TResult>(
	spec: ClinkrSpec<TContext, S, TResult>,
): ClinkrRun<TContext, S, TResult> {
	const run = hostable(spec.handler);
	return Object.assign(run, { [clinkrRunBrand]: spec });
}

export function isClinkrRun(value: unknown): value is ClinkrRun<object, CommandSchema, unknown> {
	return typeof value === "function" && clinkrRunBrand in value;
}

export function clinkrSpecForRun<TContext, S extends CommandSchema, TResult>(
	run: ClinkrRun<TContext, S, TResult>,
): ClinkrSpec<TContext, S, TResult> {
	return run[clinkrRunBrand];
}
