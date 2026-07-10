export const EXPLORER_AGENT_NAME = "explorer";
export const EXPLORER_AGENT_REPO_RELATIVE_PATH = ".ns/pi/agents/explorer.md";
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
