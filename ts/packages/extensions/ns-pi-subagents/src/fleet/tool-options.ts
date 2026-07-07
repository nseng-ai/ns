import type { PiAgentDefinition } from "@nseng-ai/pi/runtime/agent-definition";

import type { SubagentFleetRegistry } from "./registry.ts";
import type { ReadGitHead } from "./git-head.ts";

export interface SubagentToolOptions {
	cwd?: string;
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
	readGitHead?: ReadGitHead;
}

export type WithFleetRegistry<T> = T & { fleetRegistry: SubagentFleetRegistry };
