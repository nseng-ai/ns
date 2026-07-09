import { describe, expect, test } from "vitest";

import {
	buildSubagentDelegationDoctrine,
	EXPLORE_DELEGATION_DOCTRINE,
	FORKED_PI_AGENT_DELEGATION_DOCTRINE,
	SUBAGENT_DELEGATION_INTRO,
} from "../src/delegation-doctrine.ts";

function requireDoctrine(text: string | undefined): string {
	if (text === undefined) throw new Error("Expected doctrine text.");
	return text;
}

function countSubsectionHeadings(text: string): number {
	return text.match(/^### /gmu)?.length ?? 0;
}

describe("subagent delegation doctrine", () => {
	test("builds both healthy subsections in fixed order", () => {
		const doctrine = requireDoctrine(
			buildSubagentDelegationDoctrine({
				isExploreHealthy: true,
				isForkedPiAgentHealthy: true,
			}),
		);

		expect(doctrine).toBe(
			[
				SUBAGENT_DELEGATION_INTRO,
				EXPLORE_DELEGATION_DOCTRINE,
				FORKED_PI_AGENT_DELEGATION_DOCTRINE,
			].join("\n\n"),
		);
		expect(countSubsectionHeadings(doctrine)).toBe(2);
	});

	test("builds only explore doctrine when the runner is degraded", () => {
		const doctrine = requireDoctrine(
			buildSubagentDelegationDoctrine({
				isExploreHealthy: true,
				isForkedPiAgentHealthy: false,
			}),
		);

		expect(doctrine).toBe([SUBAGENT_DELEGATION_INTRO, EXPLORE_DELEGATION_DOCTRINE].join("\n\n"));
		expect(countSubsectionHeadings(doctrine)).toBe(1);
	});

	test("builds only forked_pi_agent doctrine when explore is degraded", () => {
		const doctrine = requireDoctrine(
			buildSubagentDelegationDoctrine({
				isExploreHealthy: false,
				isForkedPiAgentHealthy: true,
			}),
		);

		expect(doctrine).toBe(
			[SUBAGENT_DELEGATION_INTRO, FORKED_PI_AGENT_DELEGATION_DOCTRINE].join("\n\n"),
		);
		expect(countSubsectionHeadings(doctrine)).toBe(1);
	});

	test("omits doctrine when both built-in tools are degraded", () => {
		expect(
			buildSubagentDelegationDoctrine({
				isExploreHealthy: false,
				isForkedPiAgentHealthy: false,
			}),
		).toBeUndefined();
	});

	test("is byte deterministic across repeated calls", () => {
		const input = { isExploreHealthy: true, isForkedPiAgentHealthy: true };
		expect(buildSubagentDelegationDoctrine(input)).toBe(buildSubagentDelegationDoctrine(input));
	});
});
