import { READ_ONLY_SUBAGENT_TOOLS } from "../runner-subagents/read-only-tools.ts";
import { SUBAGENT_RUNTIME_KINDS } from "../runtime/seam.ts";
import type { SubagentAgentDescriptor } from "./registry.ts";

export const EXPLORER_SCOUT_SECTION_HEADERS = [
	"## Files Retrieved",
	"## Key Code",
	"## Architecture",
	"## Start Here",
] as const;

export const EXPLORER_AGENT_DESCRIPTOR = {
	name: "explorer",
	definitionPath: ".ns/pi/agents/explorer.md",
	minTasks: 1,
	maxTasks: 8,
	maxConcurrency: 4,
	wallClockMs: 300_000,
	tools: READ_ONLY_SUBAGENT_TOOLS,
	promptContext: "definition-only",
	modelPolicy: "cheap-or-inherit",
	maxTaskFinalTextChars: 8_000,
	maxFleetFinalTextChars: 32_000,
	supportedRuntimes: SUBAGENT_RUNTIME_KINDS,
	runtimePreference: SUBAGENT_RUNTIME_KINDS,
} as const satisfies SubagentAgentDescriptor;
