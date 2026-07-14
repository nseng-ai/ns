import { describe, expect, test } from "vitest";

import {
	objectiveRunnerCumulativeSummaryV1Schema,
	objectiveRunnerPublicationAuthorizationV1Schema,
} from "../../../src/publication/contracts.ts";
import { renderObjectiveRunnerCumulativeSummary } from "../../../src/publication/summary.ts";

const RUNNER_SHA = "2".repeat(40);
const TRACKING_SHA = "3".repeat(40);

describe("publication contracts", () => {
	test("authorization is versioned, strict, and requires both attestations", () => {
		const value = {
			version: 1,
			invocationId: "autorun-1",
			objectiveSlug: "objective-runner-external-writes",
			policyAttested: true,
			launchConfirmed: true,
			target: {
				repository: "nseng-ai/ns",
				pullRequestNumber: 42,
				pullRequestUrl: "https://github.com/nseng-ai/ns/pull/42",
				branch: "feature/publication",
				headBranch: "feature/publication",
			},
			launchHead: "1".repeat(40),
			lastPublishedHead: "1".repeat(40),
		};

		expect(objectiveRunnerPublicationAuthorizationV1Schema.safeParse(value).success).toBe(true);
		expect(
			objectiveRunnerPublicationAuthorizationV1Schema.safeParse({
				...value,
				policyAttested: false,
			}).success,
		).toBe(false);
		expect(
			objectiveRunnerPublicationAuthorizationV1Schema.safeParse({ ...value, extra: true }).success,
		).toBe(false);
	});

	test("summary rejects unversioned, empty, and failed-shape evidence", () => {
		expect(objectiveRunnerCumulativeSummaryV1Schema.safeParse(summary()).success).toBe(true);
		expect(
			objectiveRunnerCumulativeSummaryV1Schema.safeParse({ ...summary(), version: 2 }).success,
		).toBe(false);
		expect(
			objectiveRunnerCumulativeSummaryV1Schema.safeParse({ ...summary(), steps: [] }).success,
		).toBe(false);
	});
});

describe("renderObjectiveRunnerCumulativeSummary", () => {
	test("renders complete ordered evidence and explicit empty decisions", () => {
		expect(renderObjectiveRunnerCumulativeSummary(summary())).toBe(
			[
				"## Objective Runner",
				"",
				"- Objective: `objective-runner-external-writes`",
				`- Published head: \`${TRACKING_SHA}\``,
				"",
				"### Published steps",
				"",
				`1. Runner commit \`${RUNNER_SHA}\``,
				"   - Validation:",
				"     - just ts-check: **passed** — native TypeScript",
				"   - Parent decisions:",
				"     - none",
				"",
				"### Objective tracking commits",
				"",
				`- \`${TRACKING_SHA}\` — Record roadmap progress`,
				"",
			].join("\n"),
		);
	});

	test("normalizes multiline parent text into deterministic bullets", () => {
		const value = summary();
		value.steps[0]?.decisions.push("Keep the narrow\n  Consumer Gateway.");

		expect(renderObjectiveRunnerCumulativeSummary(value)).toContain(
			"     - Keep the narrow Consumer Gateway.",
		);
	});
});

function summary() {
	return {
		version: 1 as const,
		objectiveSlug: "objective-runner-external-writes",
		publishedHead: TRACKING_SHA,
		steps: [
			{
				runnerCommitSha: RUNNER_SHA,
				validation: [
					{ command: "just ts-check", result: "passed" as const, detail: "native TypeScript" },
				],
				decisions: [] as string[],
			},
		],
		objectiveTrackingCommits: [{ sha: TRACKING_SHA, subject: "Record roadmap progress" }],
	};
}
