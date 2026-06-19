import { describe, expect, test } from "vitest";

import {
	InMemoryGithubPrFeedbackGateway,
	prSummary,
} from "../support/in-memory-pr-address-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

interface MachineEnvelope {
	exit_code: number;
	data?: MapBranchPrsData;
	message?: string;
	error_type?: string;
}

interface MapBranchPrsData {
	branch_prs: Array<{
		branch: string;
		pr_number: number;
		title: string;
		url: string;
		head_ref_name: string;
		base_ref_name: string;
	}>;
	missing_branches: string[];
	ambiguous_branches: Array<{ branch: string; candidates: Array<{ pr_number: number }> }>;
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
			prSummary({ number: 13, headRefName: "feature-merged", state: "MERGED" }),
		],
	});
}

function parseEnvelope(run: Awaited<ReturnType<typeof runScenario>>): MachineEnvelope {
	return JSON.parse(run.stdout.join("")) as MachineEnvelope;
}

function mapArgs(args: readonly string[] = []): string[] {
	return ["exec", "map-branch-prs", ...args, "--format", "json"];
}

describe("pr-address exec map-branch-prs", () => {
	test("maps all branches to open PRs in input order with exit 0", async () => {
		const run = runScenario(mapArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: ["feature-b", "feature-a"] }),
		});
		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope(run);
		expect(envelope.exit_code).toBe(0);
		expect(envelope.data?.branch_prs).toEqual([
			{
				branch: "feature-b",
				pr_number: 12,
				title: "B",
				url: "https://github.example/pr/12",
				head_ref_name: "feature-b",
				base_ref_name: "feature-a",
			},
			{
				branch: "feature-a",
				pr_number: 11,
				title: "A",
				url: "https://github.example/pr/11",
				head_ref_name: "feature-a",
				base_ref_name: "master",
			},
		]);
		expect(envelope.data?.missing_branches).toEqual([]);
		expect(envelope.data?.ambiguous_branches).toEqual([]);
		expect(envelope.data?.summary).toEqual({ requested: 2, matched: 2, missing: 0, ambiguous: 0 });
	});

	test("returns semantic exit 1 with full data and a message naming missing branches", async () => {
		const run = runScenario(mapArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: ["feature-a", "no-such-branch", "feature-merged"] }),
		});
		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope(run);
		expect(envelope.exit_code).toBe(1);
		expect(envelope.message).toBe("No open PR found for branches: no-such-branch, feature-merged");
		expect(envelope.data?.branch_prs.map((entry) => entry.pr_number)).toEqual([11]);
		expect(envelope.data?.missing_branches).toEqual(["no-such-branch", "feature-merged"]);
		expect(envelope.data?.ambiguous_branches).toEqual([]);
		expect(envelope.data?.summary).toEqual({ requested: 3, matched: 1, missing: 2, ambiguous: 0 });
	});

	test("accepts the payload via --branches-json", async () => {
		const run = runScenario(
			mapArgs(["--branches-json", JSON.stringify({ branches: ["feature-a"] })]),
			{
				prFeedback: stackedPrFeedback(),
			},
		);
		expect(await run.exit).toBe(0);
		expect(parseEnvelope(run).data?.branch_prs.map((entry) => entry.branch)).toEqual(["feature-a"]);
	});

	test("returns semantic exit 1 for ambiguous shared-head-branch mapping", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [
				prSummary({ number: 30, headRefName: "feature-shared" }),
				prSummary({ number: 21, headRefName: "feature-shared" }),
			],
		});
		const run = runScenario(mapArgs(), {
			prFeedback,
			stdin: JSON.stringify({ branches: ["feature-shared"] }),
		});
		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope(run);
		expect(envelope.exit_code).toBe(1);
		expect(envelope.message).toBe("Multiple open PRs found for branches: feature-shared");
		expect(envelope.data?.branch_prs).toEqual([]);
		expect(envelope.data?.ambiguous_branches).toEqual([
			{
				branch: "feature-shared",
				candidates: expect.arrayContaining([
					expect.objectContaining({ pr_number: 30 }),
					expect.objectContaining({ pr_number: 21 }),
				]),
			},
		]);
		expect(envelope.data?.summary).toEqual({ requested: 1, matched: 0, missing: 0, ambiguous: 1 });
	});

	test("rejects duplicate branches with invalid_request", async () => {
		const run = runScenario(mapArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: ["feature-a", "feature-a"] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toBe("map-branch-prs branches contain duplicates: feature-a");
	});

	test("rejects an empty branches array with invalid_request", async () => {
		const run = runScenario(mapArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: [] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toBe("map-branch-prs requires at least one branch.");
	});

	test("rejects blank branch names with invalid_request", async () => {
		const run = runScenario(mapArgs(), {
			prFeedback: stackedPrFeedback(),
			stdin: JSON.stringify({ branches: ["feature-a", "  "] }),
		});
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).message).toBe(
			"map-branch-prs requires every branch to be non-empty.",
		);
	});

	test("rejects empty stdin with invalid_request", async () => {
		const run = runScenario(mapArgs(), { prFeedback: stackedPrFeedback(), stdin: "" });
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).error_type).toBe("invalid_request");
	});

	test("rejects malformed JSON with invalid_json", async () => {
		const run = runScenario(mapArgs(), { prFeedback: stackedPrFeedback(), stdin: "{not json" });
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).error_type).toBe("invalid_json");
	});

	test("rejects an unexpected positional argument with a commander usage error", async () => {
		// PINNED CLINKR SEMANTICS: excess arguments are a raw commander usage
		// error (stderr, exit 2), never a machine envelope.
		const run = runScenario(["exec", "map-branch-prs", "extra", "--format", "json"], {
			prFeedback: stackedPrFeedback(),
		});
		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(
			"error: too many arguments for 'map-branch-prs'. Expected 0 arguments but got 1.\n",
		);
	});

	test("maps a gh listing failure to pr_gateway_failure", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			listOpenPrsFailure: {
				code: "github_pr_feedback_gh_failed",
				message: "gh: network down",
				details: { operation: "listOpenPrs", stderr: "gh: network down", stdout: "", exitCode: 1 },
			},
		});
		const run = runScenario(mapArgs(), {
			prFeedback,
			stdin: JSON.stringify({ branches: ["feature-a"] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("pr_gateway_failure");
		expect(envelope.message).toBe("Failed to list open PRs: gh: network down");
	});
});
