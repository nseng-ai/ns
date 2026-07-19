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

export interface ClinkrHandlerBundle {
	readonly cwd: string;
	readonly events: CommandEventSink;
	readonly interact: CommandInteraction;
	readonly ns: NsContext;
	readonly caps: RenderCapabilities;
	readonly format?: ClinkrFormat;
}

export interface ClinkrCompletionBundle {
	readonly cwd: string;
	readonly ns: NsContext;
}

export type CommandCompletionProvider = (
	bundle: ClinkrCompletionBundle,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

export interface ClinkrSpec<S extends CommandSchema, TResult> {
	readonly schema: S;
	readonly resultSchema: z.ZodType<TResult>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (data: TResult, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: TResult, caps: RenderCapabilities) => string;
	readonly completions?: CommandCompletionProvider;
	readonly handler: (
		bundle: ClinkrHandlerBundle,
		request: z.output<S>,
	) => Promise<CommandExit<TResult>> | CommandExit<TResult>;
}

const clinkrRunBrand = Symbol.for("@nseng-ai/sdk/command/clinkr");

export interface ClinkrRun<S extends CommandSchema, TResult> {
	(
		bundle: ClinkrHandlerBundle,
		request: z.output<S>,
	): Promise<CommandExit<TResult>> | CommandExit<TResult>;
	readonly [clinkrRunBrand]: ClinkrSpec<S, TResult>;
}

export function clinkr<S extends CommandSchema, TResult>(
	spec: ClinkrSpec<S, TResult>,
): ClinkrRun<S, TResult> {
	return Object.assign(spec.handler, { [clinkrRunBrand]: spec });
}

export function isClinkrRun(value: unknown): value is ClinkrRun<CommandSchema, unknown> {
	return typeof value === "function" && clinkrRunBrand in value;
}

export function clinkrSpecForRun<S extends CommandSchema, TResult>(
	run: ClinkrRun<S, TResult>,
): ClinkrSpec<S, TResult> {
	return run[clinkrRunBrand];
}

export function createUnavailableInteraction(): CommandInteraction {
	return {
		confirm: async () => ({ type: "unavailable" }),
		select: async () => ({ type: "unavailable" }),
	};
}
