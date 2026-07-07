import type { SubagentRuntime } from "@nseng-ai/ns-pi-subagents/api";

import type { ThermoCouncilScope } from "./contract.ts";
import type { ThermoCouncilCommandContext, ThermoCouncilExtensionAPI } from "./host-api.ts";

export interface ThermoCouncilRunContext {
	readonly pi: ThermoCouncilExtensionAPI;
	readonly ctx: ThermoCouncilCommandContext;
	readonly runtime: SubagentRuntime;
	readonly scope: ThermoCouncilScope;
	readonly reviewGuidance?: string;
}
