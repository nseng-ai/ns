import type { PiAgentDefinition } from "@nseng-ai/pi/runtime/agent-definition";

import type { SubagentFleetRegistry } from "./registry.ts";

export interface SubagentToolOptions {
	cwd?: string;
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
}

export type WithFleetRegistry<T> = T & { fleetRegistry: SubagentFleetRegistry };
