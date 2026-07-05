export { default, thermoCouncilParity } from "./extension.ts";
export type {
	CustomMessage,
	ExecOptions,
	ExecResult,
	RegisteredCommand,
	ThermoCouncilCommandContext,
	ThermoCouncilExtensionAPI,
} from "./extension.ts";
export {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	DIFF_PROMPT_LIMIT_CHARS,
	SAFETY_NOTE,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	THERMO_COUNCIL_COMMAND_NAME,
	THERMO_COUNCIL_MESSAGE_TYPE,
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
export {
	parseThermoCouncilMaxConcurrency,
	reviewerOutcomeFromRunnerResult,
	runThermoCouncilCommand,
} from "./orchestrator.ts";
export { buildReviewerPrompt, renderReviewGuidanceBlock } from "./prompt.ts";
export {
	renderFatalReport,
	renderFinalSynthesisFailureReport,
	renderThermoCouncilReport,
	summarizeThermoCouncilReviewerOutcome,
} from "./report.ts";
export { parseThermoCouncilSeats } from "./seats.ts";
export type { EnvReader } from "./seats.ts";
export { clusterFindings, uniqueStrings } from "./synthesis.ts";
export type { FindingCluster, FlatFinding } from "./synthesis.ts";
