import type { ClinkrCompletionShell } from "./completion-support.ts";

export type ClinkrCompletionCandidateType =
	| "command"
	| "option"
	| "option-value"
	| "positional-value";

export interface ClinkrCompletionCandidate {
	value: string;
	type: ClinkrCompletionCandidateType;
	description?: string;
}

export interface ClinkrCompletionRequest {
	/** Tokens after the executable name. Include a trailing empty token after whitespace. */
	words: readonly string[];
}

export interface ClinkrDynamicCompletionRequest extends ClinkrCompletionRequest {
	current: string;
	previous: readonly string[];
	args: readonly string[];
	positionalIndex: number;
}

export type ClinkrDynamicCompletionProvider<TContext> = (
	ctx: TContext,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

export interface ClinkrCompletionResult {
	candidates: readonly ClinkrCompletionCandidate[];
}

export type { ClinkrCompletionShell } from "./completion-support.ts";

export interface RenderClinkrCompletionScriptOptions {
	commandName: string;
	shell: ClinkrCompletionShell;
	resolverCommand: readonly string[];
}

export type { ClinkrCompletionOptionPlan } from "./completion-support.ts";

export {
	CLINKR_JSON_SCHEMA_OPTION,
	CLINKR_RENDERED_COMMAND_OPTIONS,
	completionOptionFromSurface,
	renderClinkrCompletionScript,
	renderCompletionCandidatesNewline,
} from "./completion-support.ts";
