import { describe, expect, test } from "vitest";

import { buildSubagentDelegationDoctrine } from "../src/delegation-doctrine.ts";

const INTRO = [
	"## Subagent delegation",
	"",
	"Pi sessions in this repo provide a subagent system from `@nseng-ai/ns-pi-subagents` (see that package's README). Use the built-in subagent tools according to the doctrine below.",
].join("\n");

const EXPLORE_SECTION = [
	"### `explore` — parallel read-only scouts",
	"",
	"- When a question spans several files, directories, or subsystems, fan out `explore` with parallel focused tasks instead of serial read/grep — delegate the reading, keep the conclusion.",
	"- Batch independent explore tasks into one call so they run concurrently.",
	"- Work directly when you already know the exact file or symbol, or the task is trivial.",
].join("\n");

const FORKED_PI_AGENT_SECTION = [
	"### `forked_pi_agent` — focused forked Pi process",
	"",
	"- Use it for a self-contained delegated task; the prompt must carry complete context — the child starts cold.",
	"- Act on the returned status and findings; open the child session file only when you need depth.",
].join("\n");

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

		expect(doctrine).toBe([INTRO, EXPLORE_SECTION, FORKED_PI_AGENT_SECTION].join("\n\n"));
		expect(countSubsectionHeadings(doctrine)).toBe(2);
	});

	test("builds only explore doctrine when the runner is degraded", () => {
		const doctrine = requireDoctrine(
			buildSubagentDelegationDoctrine({
				isExploreHealthy: true,
				isForkedPiAgentHealthy: false,
			}),
		);

		expect(doctrine).toBe([INTRO, EXPLORE_SECTION].join("\n\n"));
		expect(countSubsectionHeadings(doctrine)).toBe(1);
	});

	test("builds only forked_pi_agent doctrine when explore is degraded", () => {
		const doctrine = requireDoctrine(
			buildSubagentDelegationDoctrine({
				isExploreHealthy: false,
				isForkedPiAgentHealthy: true,
			}),
		);

		expect(doctrine).toBe([INTRO, FORKED_PI_AGENT_SECTION].join("\n\n"));
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
