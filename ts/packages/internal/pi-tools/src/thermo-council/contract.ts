import { z } from "zod";

import type { RunnerSubagentTerminalToolDefinition } from "@internal/pi-tools/runner-subagents";

export const SUBMIT_THERMO_COUNCIL_REVIEW_TOOL = "submit_thermo_council_review";
export const BLOCK_THERMO_COUNCIL_REVIEW_TOOL = "block_thermo_council_review";

export type ThermoCouncilSeatId = "anthropic-fable" | "openai-high" | "gemini-high";
export type ThermoCouncilSeatStatus = "completed" | "blocked" | "failed";
export type FindingConfidence = "trunk-likely" | "likely" | "uncertain" | "speculative";
export type FindingSeverity = "critical" | "high" | "medium" | "low";

export interface ThermoCouncilSeatConfig {
	readonly id: ThermoCouncilSeatId;
	readonly label: string;
	readonly model: string;
}

export interface ThermoCouncilScope {
	readonly cwd: string;
	readonly baseRef: string;
	readonly baseSha: string;
	readonly headRef: string;
	readonly headSha: string;
	readonly diffStat: string;
	readonly changedFiles: readonly string[];
	readonly diffText: string;
	readonly isDiffTruncated: boolean;
	readonly rubricText: string;
}

export interface ThermoCouncilFinding {
	readonly id: string;
	readonly title: string;
	readonly files: readonly string[];
	readonly evidence: string;
	readonly problem: string;
	readonly proposedFix: string;
	readonly behaviorRisk: string;
	readonly dependencyNotes: string;
	readonly confidence: FindingConfidence;
	readonly severity: FindingSeverity;
	readonly validationHints: readonly string[];
}

export interface ThermoCouncilReview {
	readonly summary?: string;
	readonly findings: readonly ThermoCouncilFinding[];
	readonly disagreements?: readonly string[];
}

export type ThermoCouncilReviewerOutcome =
	| {
			readonly type: "completed";
			readonly seat: ThermoCouncilSeatConfig;
			readonly sessionFile?: string;
			readonly review: ThermoCouncilReview;
	  }
	| {
			readonly type: "blocked";
			readonly seat: ThermoCouncilSeatConfig;
			readonly sessionFile?: string;
			readonly reason: string;
	  }
	| {
			readonly type: "failed";
			readonly seat: ThermoCouncilSeatConfig;
			readonly sessionFile?: string;
			readonly diagnostic: string;
	  };

const stringListSchema = z.preprocess(
	normalizeStringListInput,
	z.array(z.string().trim().min(1)).default([]),
);

const stringListParameter = {
	anyOf: [{ type: "array", items: { type: "string" } }, { type: "string" }],
};

export const findingSchema = z.object({
	id: z.string().trim().min(1),
	title: z.string().trim().min(1),
	files: stringListSchema,
	evidence: z.string().trim().min(1),
	problem: z.string().trim().min(1),
	proposedFix: z.string().trim().min(1),
	behaviorRisk: z.string().trim().min(1),
	dependencyNotes: z.string().trim().min(1),
	confidence: z.enum(["trunk-likely", "likely", "uncertain", "speculative"]),
	severity: z.enum(["critical", "high", "medium", "low"]),
	validationHints: stringListSchema,
});

export const reviewSchema = z.object({
	summary: z.string().trim().min(1).optional(),
	findings: z.array(findingSchema).default([]),
	disagreements: stringListSchema,
});

export const blockedReviewSchema = z.object({
	reason: z.string().trim().min(1),
	missingContext: stringListSchema,
	suggestedRecovery: z.string().trim().optional(),
});

function normalizeStringListInput(value: unknown): unknown {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length === 0 ? [] : [trimmed];
	}
	if (!Array.isArray(value)) return value;
	return value
		.map((item) => (typeof item === "string" ? item.trim() : item))
		.filter((item) => item !== "");
}

export const submitThermoCouncilReviewTool: RunnerSubagentTerminalToolDefinition = {
	name: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	status: "completed",
	description: "Submit this council seat's structured thermonuclear review findings.",
	parameters: {
		type: "object",
		properties: {
			summary: { type: "string" },
			findings: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						files: stringListParameter,
						evidence: { type: "string" },
						problem: { type: "string" },
						proposedFix: { type: "string" },
						behaviorRisk: { type: "string" },
						dependencyNotes: { type: "string" },
						confidence: {
							type: "string",
							enum: ["trunk-likely", "likely", "uncertain", "speculative"],
						},
						severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
						validationHints: stringListParameter,
					},
					required: [
						"id",
						"title",
						"evidence",
						"problem",
						"proposedFix",
						"behaviorRisk",
						"dependencyNotes",
						"confidence",
						"severity",
					],
				},
			},
			disagreements: stringListParameter,
		},
		required: ["findings"],
	},
};

export const blockThermoCouncilReviewTool: RunnerSubagentTerminalToolDefinition = {
	name: BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	status: "blocked",
	description: "Report why this council seat cannot complete the review.",
	parameters: {
		type: "object",
		properties: {
			reason: { type: "string" },
			missingContext: stringListParameter,
			suggestedRecovery: { type: "string" },
		},
		required: ["reason"],
	},
};
