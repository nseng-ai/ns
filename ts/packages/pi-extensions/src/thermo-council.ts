import { definePiSurfaceParity } from "./parity.ts";
import { THERMO_COUNCIL_COMMAND_NAME } from "./thermo-council/constants.ts";
import { runThermoCouncilCommand } from "./thermo-council/orchestrator.ts";
import type { ThermoCouncilExtensionAPI } from "./thermo-council/types.ts";

export {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	blockThermoCouncilReviewTool,
	submitThermoCouncilReviewTool,
} from "./thermo-council-contract.ts";
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
} from "./thermo-council-contract.ts";
export {
	THERMO_COUNCIL_COMMAND_NAME,
	THERMO_COUNCIL_MESSAGE_TYPE,
} from "./thermo-council/constants.ts";
export { buildReviewerPrompt } from "./thermo-council/prompt.ts";
export { renderThermoCouncilReport } from "./thermo-council/report.ts";
export { parseThermoCouncilSeats } from "./thermo-council/seats.ts";
export { clusterFindings } from "./thermo-council/synthesis.ts";
export { runThermoCouncilCommand } from "./thermo-council/orchestrator.ts";

export const thermoCouncilParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: THERMO_COUNCIL_COMMAND_NAME,
		workflow:
			"Run a Pi-native multi-model thermonuclear review council and present a session-local synthesized report",
		parity: "WAIVED",
		fallback:
			"Non-Pi agents should run the portable thermonuclear review rubric directly from .sdl/reviews/thermonuclear-review.md or use the Thermostack skill for a single-agent review/branch proposal workflow.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
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
