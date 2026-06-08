import type { ThinkingLevel } from "../cmux/types.ts";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const satisfies readonly ThinkingLevel[];
const THINKING_LEVEL_SET: ReadonlySet<unknown> = new Set(THINKING_LEVELS);

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return THINKING_LEVEL_SET.has(value);
}
