export type {
	AgentEndContext,
	AutocompleteItem,
	AutocompleteOptions,
	AutocompleteProvider,
	AutocompleteSuggestions,
	BaseContext,
	CommandContext,
	CommandDefinition,
	CustomMessage,
	ExecOptions,
	ExecResult,
	ExtensionAPI,
	ModelInfo,
	ModelRegistry,
	NotifyLevel,
	SessionStartContext,
	ThinkingLevel,
	UiLike,
} from "@sdl/capability-kit/cmux/types";

import type { ThinkingLevel } from "@sdl/capability-kit/cmux/types";

const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
] as const satisfies readonly ThinkingLevel[];
const THINKING_LEVEL_SET: ReadonlySet<unknown> = new Set(THINKING_LEVELS);

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return THINKING_LEVEL_SET.has(value);
}
