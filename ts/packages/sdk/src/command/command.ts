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
import type { CommandExit } from "./result.ts";
import type { NsProgressPhaseEvent } from "./services.ts";

export type CommandSchema = z.ZodObject;
const emptyCommandSchema = z.strictObject({});
export type EmptyCommandSchema = typeof emptyCommandSchema;

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

export interface NsCommandBundle {
	readonly cwd: string;
	readonly events: CommandEventSink;
	readonly interact: CommandInteraction;
	readonly ns: NsContext;
	readonly caps: RenderCapabilities;
	readonly format?: ClinkrFormat;
}

export interface NsCommandCompletionBundle {
	readonly cwd: string;
	readonly ns: NsContext;
}

export type NsCommandCompletionProvider = (
	bundle: NsCommandCompletionBundle,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

export interface NsCommandDefinition<TResult, S extends CommandSchema = EmptyCommandSchema> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly schema?: S;
	readonly resultSchema: z.ZodType<TResult>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	renderHuman?(data: TResult, caps: RenderCapabilities): string;
	renderMarkdown?(data: TResult, caps: RenderCapabilities): string;
	readonly completions?: NsCommandCompletionProvider;
	handler(
		bundle: NsCommandBundle,
		request: z.output<S>,
	): Promise<CommandExit<TResult>> | CommandExit<TResult>;
}

export interface DefineCommandOptions<TResult, S extends CommandSchema = EmptyCommandSchema> {
	readonly name: string;
	readonly summary: string;
	readonly description?: string;
	readonly schema?: S;
	readonly resultSchema: z.ZodType<TResult>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (data: TResult, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: TResult, caps: RenderCapabilities) => string;
	readonly completions?: NsCommandCompletionProvider;
	readonly handler: (
		bundle: NsCommandBundle,
		request: z.output<S>,
	) => Promise<CommandExit<TResult>> | CommandExit<TResult>;
}

export function defineCommand<TResult, S extends CommandSchema = EmptyCommandSchema>(
	options: DefineCommandOptions<TResult, S>,
): NsCommandDefinition<TResult, S> {
	return {
		...options,
		description: options.description ?? options.summary,
	};
}

export function createUnavailableInteraction(): CommandInteraction {
	return {
		confirm: async () => ({ type: "unavailable" }),
		select: async () => ({ type: "unavailable" }),
	};
}

export type { NsContext };
