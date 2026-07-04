import type { ThermoCouncilReviewerOutcome } from "./contract.ts";

export interface ThermoCouncilReviewerOutcomeSummary {
	readonly progress: string;
	readonly diagnostic: string;
}

export function summarizeThermoCouncilReviewerOutcome(
	outcome: ThermoCouncilReviewerOutcome,
): ThermoCouncilReviewerOutcomeSummary {
	switch (outcome.type) {
		case "completed": {
			const findingCount = outcome.review.findings.length;
			return {
				progress: `${outcome.seat.label} completed (${findingCount} findings)`,
				diagnostic: `${findingCount} findings`,
			};
		}
		case "blocked":
			return {
				progress: `${outcome.seat.label} blocked`,
				diagnostic: outcome.reason,
			};
		case "failed":
			return {
				progress: `${outcome.seat.label} failed`,
				diagnostic: outcome.diagnostic,
			};
	}
}
