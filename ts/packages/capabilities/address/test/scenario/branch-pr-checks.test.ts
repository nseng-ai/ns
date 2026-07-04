import { describe, expect, test } from "vitest";

import {
	InMemoryGithubPrFeedbackGateway,
	prSummary,
} from "../support/in-memory-pr-address-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

interface MachineEnvelope {
	exitCode: number;
	data?: BranchPrChecksData;
	message?: string;
	errorType?: string;
}

interface BranchPrChecksData {
	entries: Array<{
		branch: string;
		status: "found" | "missing" | "ambiguous";
		target?: { pr_number: number | null; head_ref_name: string | null };
		counts?: { passing: number; pending: number; failing: number; unknown: number };
		checks?: Array<{ name: string }>;
		candidates?: Array<{ pr_number: number }>;
	}>;
	summary: { requested: number; matched: number; missing: number; ambiguous: number };
}

function stackedPrFeedback(): InMemoryGithubPrFeedbackGateway {
	return new InMemoryGithubPrFeedbackGateway({
		prs: [
			prSummary({
				number: 11,
				headRefName: "feature-a",
				baseRefName: "master",
				title: "A",
				url: "https://github.example/pr/11",
			}),
			prSummary({
				number: 12,
				headRefName: "feature-b",
				baseRefName: "feature-a",
				title: "B",
				url: "https://github.example/pr/12",
			}),
		],
		checks: {
			11: {
				counts: { passing: 2, pending: 0, failing: 1, unknown: 0, hasMore: false },
				checks: [
					{
						bucket: "failing",
						kind: "check_run",
						name: "typescript",
						workflowName: "ci",
						status: "COMPLETED",
						conclusion: "FAILURE",
						state: null,
						startedAt: null,
						completedAt: null,
						createdAt: null,
						detailsUrl: null,
						targetUrl: null,
						identity: "check-run:ci:typescript",
					},
				],
			},
		},
	});
}

function parseEnvelope(run: Awaited<ReturnType<typeof runScenario>>): MachineEnvelope {
	return JSON.parse(run.stdout.join("")) as MachineEnvelope;
}

function checksArgs(args: readonly string[] = []): string[] {
	return ["exec", "branch-pr-checks", ...args, "--format", "json"];
}

describe("ns address exec branch-pr-checks", () => {
	test("returns found entries with checks in input order with exit 0", async () => {
		const run = runScenario(checksArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: ["feature-b", "feature-a"] }),
		});
		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope(run);
		expect(envelope.exitCode).toBe(0);
		expect(envelope.data?.entries).toEqual([
			expect.objectContaining({
				branch: "feature-b",
				status: "found",
				target: expect.objectContaining({ pr_number: 12, head_ref_name: "feature-b" }),
				counts: { passing: 0, pending: 0, failing: 0, unknown: 0, hasMore: false },
				checks: [],
			}),
			expect.objectContaining({
				branch: "feature-a",
				status: "found",
				target: expect.objectContaining({ pr_number: 11, head_ref_name: "feature-a" }),
				counts: { passing: 2, pending: 0, failing: 1, unknown: 0, hasMore: false },
				checks: [expect.objectContaining({ name: "typescript", bucket: "failing" })],
			}),
		]);
		expect(envelope.data?.summary).toEqual({ requested: 2, matched: 2, missing: 0, ambiguous: 0 });
	});

	test("returns semantic exit 1 with full data and a message naming missing branches", async () => {
		const run = runScenario(checksArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: ["feature-a", "no-such-branch"] }),
		});
		expect(await run.exit).toBe(1);
		const envelope = parseEnvelope(run);
		expect(envelope.exitCode).toBe(1);
		expect(envelope.message).toBe("No open PR found for branches: no-such-branch");
		expect(envelope.data?.entries).toEqual([
			expect.objectContaining({ branch: "feature-a", status: "found" }),
			{ branch: "no-such-branch", status: "missing" },
		]);
		expect(envelope.data?.summary).toEqual({ requested: 2, matched: 1, missing: 1, ambiguous: 0 });
	});

	test("returns semantic exit 1 with candidates for ambiguous branches", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			ambiguousBranchPrs: {
				"feature-shared": [
					prSummary({ number: 30, headRefName: "feature-shared" }),
					prSummary({ number: 21, headRefName: "feature-shared" }),
				],
			},
		});
		const run = runScenario(checksArgs(), {
			prFeedback,
			stdin: JSON.stringify({ branches: ["feature-shared"] }),
		});
		expect(await run.exit).toBe(1);
		const envelope = parseEnvelope(run);
		expect(envelope.message).toBe("Multiple open PRs found for branches: feature-shared");
		expect(envelope.data?.entries).toEqual([
			expect.objectContaining({
				branch: "feature-shared",
				status: "ambiguous",
				candidates: [
					expect.objectContaining({ pr_number: 30 }),
					expect.objectContaining({ pr_number: 21 }),
				],
			}),
		]);
		expect(envelope.data?.summary).toEqual({ requested: 1, matched: 0, missing: 0, ambiguous: 1 });
	});

	test("accepts the payload via --branches-json", async () => {
		const run = runScenario(
			checksArgs(["--branches-json", JSON.stringify({ branches: ["feature-a"] })]),
			{ prFeedback: stackedPrFeedback() },
		);
		expect(await run.exit).toBe(0);
		expect(parseEnvelope(run).data?.entries.map((entry) => entry.branch)).toEqual(["feature-a"]);
	});

	test("rejects duplicate branches with invalid_request", async () => {
		const run = runScenario(checksArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: ["feature-a", "feature-a"] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.errorType).toBe("invalid-request");
		expect(envelope.message).toBe("branch-pr-checks branches contain duplicates: feature-a");
	});

	test("rejects an empty branches array with invalid_request", async () => {
		const run = runScenario(checksArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: [] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.errorType).toBe("invalid-request");
		expect(envelope.message).toBe("branch-pr-checks requires at least one branch.");
	});

	test("rejects blank branch names with invalid_request", async () => {
		const run = runScenario(checksArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: ["feature-a", "  "] }),
		});
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).message).toBe(
			"branch-pr-checks requires every branch to be non-empty.",
		);
	});

	test("rejects malformed JSON with invalid_json", async () => {
		const run = runScenario(checksArgs(), { prFeedback: stackedPrFeedback(), stdin: "{not json" });
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).errorType).toBe("invalid-json");
	});

	test("rejects an unexpected positional argument with a commander usage error", async () => {
		// PINNED CLINKR SEMANTICS: excess arguments in JSON mode are emitted as
		// usage-error machine envelopes on stdout.
		const run = runScenario(["exec", "branch-pr-checks", "extra", "--format", "json"], {
			prFeedback: stackedPrFeedback(),
		});
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run)).toMatchObject({
			exitCode: 2,
			errorType: "usageError",
			message: "error: too many arguments for 'branch-pr-checks'. Expected 0 arguments but got 1.",
		});
	});

	test("maps a batched gateway failure to pr_gateway_failure", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			branchPrChecksFailure: {
				code: "github_pr_feedback_gh_failed",
				message: "gh: network down",
				details: {
					operation: "getBranchPrChecks",
					stderr: "gh: network down",
					stdout: "",
					exitCode: 1,
				},
			},
		});
		const run = runScenario(checksArgs(), {
			prFeedback,
			stdin: JSON.stringify({ branches: ["feature-a"] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.errorType).toBe("pr-gateway-failure");
		expect(envelope.message).toBe("Failed to fetch branch PR checks: gh: network down");
	});
});
