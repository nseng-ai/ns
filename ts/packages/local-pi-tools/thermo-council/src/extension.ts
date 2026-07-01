import { definePiSurfaceParity } from "@sdl/pi/parity/extension";
import { THERMO_COUNCIL_COMMAND_NAME } from "./constants.ts";
import { runThermoCouncilCommand } from "./orchestrator.ts";
import type { ThermoCouncilExtensionAPI } from "./types.ts";

export {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	blockThermoCouncilReviewTool,
	submitThermoCouncilReviewTool,
} from "./contract.ts";
export type {
	FindingConfidence,
	FindingSeverity,
	ThermoCouncilFinding,
	ThermoCouncilReview,
	ThermoCouncilReviewerOutcome,
	ThermoCouncilScope,
	ThermoCouncilSeatConfig,
	ThermoCouncilSeatId,
	ThermoCouncilSeatStatus,
} from "./contract.ts";
export { THERMO_COUNCIL_COMMAND_NAME, THERMO_COUNCIL_MESSAGE_TYPE } from "./constants.ts";
export { buildReviewerPrompt } from "./prompt.ts";
export { renderThermoCouncilReport } from "./report.ts";
export { parseThermoCouncilSeats } from "./seats.ts";
export { clusterFindings } from "./synthesis.ts";
export { parseThermoCouncilMaxConcurrency, runThermoCouncilCommand } from "./orchestrator.ts";

export const thermoCouncilParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: THERMO_COUNCIL_COMMAND_NAME,
		workflow:
			"Run a Pi-native multi-model thermonuclear review council and present a session-local synthesized report",
		parity: "WAIVED",
		fallback:
			"Non-Pi agents should run the portable thermonuclear review rubric directly from .sdl/reviews/thermonuclear-review/review.md or use the Thermostack skill for a single-agent review/branch proposal workflow.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@local-pi-tools/thermo-council",
		sourceModule: "thermo-council",
		notes:
			"The command is Pi-specific because it orchestrates multiple Pi runner subagents, model refs, terminal capture tools, and session-local presentation.",
	},
] as const);

export default function thermoCouncilExtension(pi: ThermoCouncilExtensionAPI): void {
	pi.registerCommand(THERMO_COUNCIL_COMMAND_NAME, {
		description:
			"Run a multi-model thermonuclear review council over inferred checkout scope and present one session-local report",
		argumentHint: "[review guidance]",
		handler: async (args, ctx) => {
			await ctx.waitForIdle?.();
			await runThermoCouncilCommand(pi, ctx, args);
		},
	});
}
