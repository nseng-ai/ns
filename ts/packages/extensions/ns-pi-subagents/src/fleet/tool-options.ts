import type { PiAgentDefinition } from "@nseng-ai/pi/runtime/agent-definition";

import type { RunnerSubagentFleetRegistry } from "../runner-subagents/fleet.ts";

export interface SubagentToolOptions {
	cwd?: string;
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
}

export type WithFleetRegistry<T> = T & { fleetRegistry: RunnerSubagentFleetRegistry };
