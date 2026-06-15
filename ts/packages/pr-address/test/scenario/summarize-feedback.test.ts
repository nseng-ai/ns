import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import type { PRDiscussionComment, PRReview, PRReviewThread, PRSummary } from "../../src/gateways.ts";
import { InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

type GithubVariant = "default" | "lookup-failure";

interface SummarizeFeedbackFixtureCase {
	name: string;
	args: string[];
	github: GithubVariant;
	expected_exit_code: number;
	expected_envelope_text: string;
}

interface SummarizeFeedbackFixture {
	gateway: {
		pr: PRSummary;
		reviews: PRReview[];
		review_threads: PRReviewThread[];
		discussion_comments: PRDiscussionComment[];
	};
	cases: SummarizeFeedbackFixtureCase[];
}

const fixture = JSON.parse(await readFile(new URL("../fixtures/summarize-feedback/summarize-feedback.json", import.meta.url), "utf8")) as SummarizeFeedbackFixture;

function githubGatewayFor(variant: GithubVariant): InMemoryPrAddressGitHubGateway {
	if (variant === "lookup-failure") return new InMemoryPrAddressGitHubGateway({ lookupFailurePrNumbers: new Set([fixture.gateway.pr.number]) });
	return new InMemoryPrAddressGitHubGateway({
		prs: [fixture.gateway.pr],
		reviews: { [fixture.gateway.pr.number]: fixture.gateway.reviews },
		reviewThreads: { [fixture.gateway.pr.number]: fixture.gateway.review_threads },
		discussionComments: { [fixture.gateway.pr.number]: fixture.gateway.discussion_comments },
	});
}

describe("summarize-feedback parity with the Python CLI", () => {
	for (const summarizeCase of fixture.cases) {
		test(`matches the Python envelope for ${summarizeCase.name}`, async () => {
			const run = runScenario(["exec", ...summarizeCase.args, "--stdout-mode", "full"], { github: githubGatewayFor(summarizeCase.github) });

			expect(await run.exit).toBe(summarizeCase.expected_exit_code);
			expect(run.stdout.join("")).toBe(summarizeCase.expected_envelope_text);
		});
	}

	test("requires an integer PR number argument", async () => {
		// PINNED CLINKR SEMANTICS: strict-int rejection is a raw commander usage
		// error (stderr, exit 2), never a machine envelope — click parity.
		const run = runScenario(["exec", "summarize-feedback", "abc", "--format", "json"], { github: githubGatewayFor("default") });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("expected an integer");
	});
});
