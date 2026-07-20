import type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrFormat,
	OptionSpec,
	RenderCapabilities,
} from "@nseng-ai/clinkr";
import type { PositionalSpec } from "@nseng-ai/clinkr/raw";
import { z } from "zod";

import type { NsContext } from "./catalog.ts";
import type { CommandExit } from "../sdk/result.ts";
import type { NsProgressPhaseEvent } from "../sdk/services.ts";

export type CommandSchema = z.ZodObject;

export interface CommandEventSink {
	readonly isLive: boolean;
	emit(event: NsProgressPhaseEvent): void;
}

export interface ConfirmRequest {
	readonly message: string;
	readonly defaultChoice?: "confirm" | "decline";
}

export type ConfirmResult =
	| { readonly type: "confirmed" }
	| { readonly type: "declined" }
	| { readonly type: "unavailable" }
	| { readonly type: "aborted" };

export interface SelectChoice<T extends string = string> {
	readonly value: T;
	readonly label: string;
}

export interface SelectRequest<T extends string = string> {
	readonly message: string;
	readonly choices: readonly SelectChoice<T>[];
	readonly defaultChoice?: T;
}

export type SelectResult<T extends string = string> =
	| { readonly type: "selected"; readonly value: T }
	| { readonly type: "unavailable" }
	| { readonly type: "aborted" };

export interface CommandInteraction {
	confirm(request: ConfirmRequest): Promise<ConfirmResult>;
	select<T extends string>(request: SelectRequest<T>): Promise<SelectResult<T>>;
}

export interface NsClinkrCommandBundle {
	readonly cwd: string;
	readonly events: CommandEventSink;
	readonly interact: CommandInteraction;
	readonly ns: NsContext;
	readonly caps: RenderCapabilities;
	readonly format?: ClinkrFormat;
}

export interface NsClinkrCompletionBundle {
	readonly cwd: string;
	readonly ns: NsContext;
}

export type NsClinkrCompletionProvider = (
	bundle: NsClinkrCompletionBundle,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

const emptyCommandSchema = z.strictObject({});

type EmptyCommandSchema = typeof emptyCommandSchema;

export interface NsClinkrCommandOptions<TResult, S extends CommandSchema = EmptyCommandSchema> {
	readonly schema?: S;
	readonly resultSchema: z.ZodType<TResult>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (data: TResult, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: TResult, caps: RenderCapabilities) => string;
	readonly completions?: NsClinkrCompletionProvider;
	readonly handler: (
		bundle: NsClinkrCommandBundle,
		request: z.output<S>,
	) => Promise<CommandExit<TResult>> | CommandExit<TResult>;
}

const nsClinkrCommandBrand = Symbol.for("@nseng-ai/sdk/command/ns-clinkr-command");

export interface NsClinkrCommandRun<S extends CommandSchema, TResult> {
	(
		bundle: NsClinkrCommandBundle,
		request: z.output<S>,
	): Promise<CommandExit<TResult>> | CommandExit<TResult>;
	readonly [nsClinkrCommandBrand]: {
		readonly options: NsClinkrCommandOptions<TResult, S>;
		readonly schema: CommandSchema;
	};
}

export function nsClinkrCommand<TResult, S extends CommandSchema = EmptyCommandSchema>(
	options: NsClinkrCommandOptions<TResult, S>,
): NsClinkrCommandRun<S, TResult> {
	return Object.assign(options.handler, {
		[nsClinkrCommandBrand]: {
			options,
			schema: options.schema ?? emptyCommandSchema,
		},
	});
}

export function isNsClinkrCommandRun(
	value: unknown,
): value is NsClinkrCommandRun<CommandSchema, unknown> {
	return typeof value === "function" && nsClinkrCommandBrand in value;
}

export function nsClinkrCommandOptionsForRun<S extends CommandSchema, TResult>(
	run: NsClinkrCommandRun<S, TResult>,
) {
	const metadata = run[nsClinkrCommandBrand];
	return { ...metadata.options, schema: metadata.schema };
}

export function createUnavailableInteraction(): CommandInteraction {
	return {
		confirm: async () => ({ type: "unavailable" }),
		select: async () => ({ type: "unavailable" }),
	};
}
