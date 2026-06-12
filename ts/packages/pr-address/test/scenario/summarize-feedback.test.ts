import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PRSummary } from "../../src/gateways.ts";
import { InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";

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

function runManaged(args: readonly string[], github: InMemoryPrAddressGitHubGateway): { exit: Promise<number>; stdout: string[]; stderr: string[] } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			context: { github },
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: async () => "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

describe("summarize-feedback parity with the Python CLI", () => {
	for (const summarizeCase of fixture.cases) {
		test(`matches the Python envelope for ${summarizeCase.name}`, async () => {
			const run = runManaged(["exec", ...summarizeCase.args], githubGatewayFor(summarizeCase.github));

			expect(await run.exit).toBe(summarizeCase.expected_exit_code);
			expect(run.stdout.join("")).toBe(summarizeCase.expected_envelope_text);
		});
	}

	test("requires an integer PR number argument", async () => {
		const run = runManaged(["exec", "summarize-feedback", "abc", "--format", "json"], githubGatewayFor("default"));

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("summarize-feedback requires an integer PR number argument.");
	});

	test("requires an integer --body-chars value", async () => {
		const run = runManaged(["exec", "summarize-feedback", "42", "--body-chars", "abc", "--format", "json"], githubGatewayFor("default"));

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("--body-chars");
	});
});
