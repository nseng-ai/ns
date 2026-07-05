export const EXPLORER_AGENT_NAME = "explorer";
export const EXPLORE_TOOL_NAME = "explore";

/**
 * Pi core ships exactly seven tools (read, grep, find, ls, bash, edit, write) and
 * explorer children always run with --no-extensions, so this positive allowlist is a
 * complete capability-level read-only guarantee: no bash, no edit, no write.
 */
export const EXPLORER_READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;

export const EXPLORER_SCOUT_SECTION_HEADERS = [
	"## Files Retrieved",
	"## Key Code",
	"## Architecture",
	"## Start Here",
] as const;

export const ANTHROPIC_PROVIDER_ID = "anthropic";
export const EXPLORER_CHEAP_MODEL_SHORTHAND = "haiku";
export const EXPLORER_CHEAP_QUALIFIED_MODEL = "anthropic/claude-haiku-4-5";
