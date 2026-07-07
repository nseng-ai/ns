export const EXPLORER_AGENT_NAME = "explorer";
export const EXPLORER_AGENT_REPO_RELATIVE_PATH = ".ns/pi/agents/explorer.md";
export const EXPLORE_TOOL_NAME = "explore";
export const EXPLORE_BREADTH_VALUES = ["quick", "medium", "very-thorough"] as const;
export type ExploreBreadth = (typeof EXPLORE_BREADTH_VALUES)[number];

export interface ExploreBreadthProfile {
	maxTasks: number;
	maxConcurrency: number;
	wallClockMs: number;
}

export const EXPLORE_BREADTH_PROFILES: Record<ExploreBreadth, ExploreBreadthProfile> = {
	quick: { maxTasks: 2, maxConcurrency: 2, wallClockMs: 90_000 },
	medium: { maxTasks: 4, maxConcurrency: 3, wallClockMs: 180_000 },
	"very-thorough": { maxTasks: 8, maxConcurrency: 4, wallClockMs: 300_000 },
};

export const EXPLORE_MIN_TASKS = 1;
export const EXPLORE_ABSOLUTE_MAX_TASKS = 8;
export const EXPLORE_DIRECT_RESULT_TOTAL_CAP_CHARS = 32_000;
export const EXPLORE_DIRECT_RESULT_PER_TASK_CAP_CHARS = 8_000;

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
