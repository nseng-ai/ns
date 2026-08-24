import type { SubagentRuntime } from "@internal/ns-pi-subagents/api";
import type { EffectiveProjectConfig } from "@nseng-ai/sdk/project-config";

import type { ThermoCouncilScope } from "./contract.ts";
import type { ThermoCouncilCommandContext, ThermoCouncilExtensionAPI } from "./host-api.ts";

export interface ThermoCouncilRunContext {
	readonly pi: ThermoCouncilExtensionAPI;
	readonly ctx: ThermoCouncilCommandContext;
	readonly runtime: SubagentRuntime;
	readonly projectConfig: EffectiveProjectConfig;
	readonly scope: ThermoCouncilScope;
	readonly reviewGuidance?: string;
}
