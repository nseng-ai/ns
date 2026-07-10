import type { SubagentAgentDescriptor } from "./registry.ts";

export const TASK_AGENT_DESCRIPTOR = {
	name: "task",
	definitionPath: ".ns/pi/agents/task.md",
	minTasks: 1,
	maxTasks: 1,
	maxConcurrency: 1,
	tools: ["read", "bash", "edit", "write"],
	promptContext: "curated-worktree",
	modelPolicy: "inherit",
	maxTaskFinalTextChars: 48_000,
	supportedRuntimes: ["subprocess", "in-process"],
	runtimePreference: ["subprocess", "in-process"],
} as const satisfies SubagentAgentDescriptor;
