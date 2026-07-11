import { definePiSurfaceParity } from "@nseng-ai/pi/parity/extension";

import { THERMO_COUNCIL_COMMAND_NAME } from "./contract.ts";
import {
	getOrCreateSubagentFleetRegistry,
	type SubagentRuntime,
} from "@nseng-ai/ns-pi-subagents/api";

import type { ThermoCouncilExtensionAPI } from "./host-api.ts";
import { runThermoCouncilCommand } from "./orchestrator.ts";

export const thermoCouncilParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: THERMO_COUNCIL_COMMAND_NAME,
		workflow:
			"Run a Pi-native multi-model thermonuclear review council and present a session-local synthesized report",
		parity: "WAIVED",
		fallback:
			"Non-Pi agents should run the portable thermonuclear review rubric directly from .ns/reviews/thermonuclear-review/review.md or use the Thermostack skill for a single-agent review/branch proposal workflow.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/thermo-council",
		sourceModule: "thermo-council",
		notes:
			"The command is Pi-specific because it orchestrates multiple Pi runner subagents, model refs, terminal capture tools, and session-local presentation.",
	},
] as const);

export interface ThermoCouncilExtensionOptions {
	readonly runtime?: SubagentRuntime;
}

export default function thermoCouncilExtension(
	pi: ThermoCouncilExtensionAPI,
	options: ThermoCouncilExtensionOptions = {},
): void {
	const fleetRegistry = getOrCreateSubagentFleetRegistry({
		owner: pi.events,
		onSessionStart: (handler) => pi.on("session_start", handler),
		onSessionShutdown: (handler) => pi.on("session_shutdown", handler),
	});
	pi.registerCommand(THERMO_COUNCIL_COMMAND_NAME, {
		description:
			"Run a multi-model thermonuclear review council over inferred checkout scope and present one session-local report",
		argumentHint: "[review guidance]",
		handler: async (args, ctx) => {
			await ctx.waitForIdle?.();
			await runThermoCouncilCommand(pi, ctx, args, {
				fleetRegistry,
				...(options.runtime === undefined ? {} : { runtime: options.runtime }),
			});
		},
	});
}
