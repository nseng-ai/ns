// Compatibility re-export: these Pi extension/harness types are vendor-neutral and
// live in the kit-owned module. Existing `@nseng-ai/capability-kit/cmux/types`
// importers remain source-compatible; new code should import
// `@nseng-ai/capability-kit/pi-types` directly.
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
	ExtensionAPI,
	ModelInfo,
	ModelRegistry,
	NotifyLevel,
	RawPiExecOptions,
	RawPiExecResult,
	SessionStartContext,
	SkillCommandInfoLike,
	ThinkingLevel,
	UiLike,
} from "../kit/pi-types.ts";
