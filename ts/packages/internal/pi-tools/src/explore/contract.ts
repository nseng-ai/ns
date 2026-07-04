export const EXPLORER_AGENT_NAME = "explorer";
export const EXPLORER_AGENT_REPO_RELATIVE_PATH = ".ns/pi/agents/explorer.md";
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
export const EXPLORER_CHEAP_MODEL_ID = "claude-haiku-4-5";
export const EXPLORER_CHEAP_MODEL_SHORTHAND = "haiku";
export const EXPLORER_CHEAP_QUALIFIED_MODEL = `${ANTHROPIC_PROVIDER_ID}/${EXPLORER_CHEAP_MODEL_ID}`;
