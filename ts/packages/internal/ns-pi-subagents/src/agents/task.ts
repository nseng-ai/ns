import { SUBAGENT_RUNTIME_KINDS } from "../runtime/seam.ts";
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
	supportedRuntimes: SUBAGENT_RUNTIME_KINDS,
	runtimePreference: SUBAGENT_RUNTIME_KINDS,
} as const satisfies SubagentAgentDescriptor;
