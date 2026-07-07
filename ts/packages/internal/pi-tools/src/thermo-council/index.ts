export { default, thermoCouncilParity } from "./extension.ts";
export type { ThermoCouncilExtensionOptions } from "./extension.ts";
export type {
	CustomMessage,
	ExecOptions,
	ExecResult,
	RegisteredCommand,
	ThermoCouncilCommandContext,
	ThermoCouncilExtensionAPI,
} from "./host-api.ts";
export {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	THERMO_COUNCIL_COMMAND_NAME,
	THERMO_COUNCIL_MESSAGE_TYPE,
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
export { runThermoCouncilCommand } from "./orchestrator.ts";
export type { RunThermoCouncilCommandOptions } from "./orchestrator.ts";
export { reviewerOutcomeFromRunnerResult } from "./review-recovery.ts";
export { buildReviewerPrompt } from "./prompt.ts";
export { renderThermoCouncilReport } from "./report.ts";
export { parseThermoCouncilMaxConcurrency, parseThermoCouncilSeats } from "./seats.ts";
export { clusterFindings } from "./synthesis.ts";
