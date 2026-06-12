import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";
import { fakePrAddressContext, InMemoryPrAddressGitHubGateway, prSummary } from "../support/in-memory-pr-address-gateways.ts";

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	legacy: InMemoryLegacyPrAddressGateway;
}

interface MachineEnvelope {
	exit_code: number;
	data?: MapBranchPrsData;
	message?: string;
	error_type?: string;
}

interface MapBranchPrsData {
	branch_prs: Array<{ branch: string; pr_number: number; title: string; url: string; head_ref_name: string; base_ref_name: string }>;
	missing_branches: string[];
	summary: { requested: number; matched: number; missing: number };
}

function runWithGithub(args: readonly string[], options: { github?: InMemoryPrAddressGitHubGateway | undefined; stdin?: string | undefined } = {}): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy = new InMemoryLegacyPrAddressGateway([0]);
	return {
		exit: runCli(args, {
			context: fakePrAddressContext({ legacy, ...(options.github === undefined ? {} : { github: options.github }) }),
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: async () => options.stdin ?? "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		legacy,
	};
}

function stackedGithub(): InMemoryPrAddressGitHubGateway {
	return new InMemoryPrAddressGitHubGateway({
		prs: [
			prSummary({ number: 11, head_ref_name: "feature-a", base_ref_name: "master", title: "A", url: "https://github.example/pr/11" }),
			prSummary({ number: 12, head_ref_name: "feature-b", base_ref_name: "feature-a", title: "B", url: "https://github.example/pr/12" }),
			prSummary({ number: 13, head_ref_name: "feature-merged", state: "MERGED" }),
		],
	});
}

function parseEnvelope(run: CliRun): MachineEnvelope {
	return JSON.parse(run.stdout.join("")) as MachineEnvelope;
}

describe("pr-address exec map-branch-prs", () => {
	test("maps all branches to open PRs in input order with exit 0", async () => {
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], {
			github: stackedGithub(),
			stdin: JSON.stringify({ branches: ["feature-b", "feature-a"] }),
		});
		expect(await run.exit).toBe(0);
		expect(run.legacy.calls).toEqual([]);
		const envelope = parseEnvelope(run);
		expect(envelope.exit_code).toBe(0);
		expect(envelope.data?.branch_prs).toEqual([
			{ branch: "feature-b", pr_number: 12, title: "B", url: "https://github.example/pr/12", head_ref_name: "feature-b", base_ref_name: "feature-a" },
			{ branch: "feature-a", pr_number: 11, title: "A", url: "https://github.example/pr/11", head_ref_name: "feature-a", base_ref_name: "master" },
		]);
		expect(envelope.data?.missing_branches).toEqual([]);
		expect(envelope.data?.summary).toEqual({ requested: 2, matched: 2, missing: 0 });
	});

	test("returns exit 1 with full data and a message naming missing branches", async () => {
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], {
			github: stackedGithub(),
			stdin: JSON.stringify({ branches: ["feature-a", "no-such-branch", "feature-merged"] }),
		});
		expect(await run.exit).toBe(1);
		const envelope = parseEnvelope(run);
		expect(envelope.exit_code).toBe(1);
		expect(envelope.message).toBe("No open PR found for branches: no-such-branch, feature-merged");
		expect(envelope.data?.branch_prs.map((entry) => entry.pr_number)).toEqual([11]);
		expect(envelope.data?.missing_branches).toEqual(["no-such-branch", "feature-merged"]);
		expect(envelope.data?.summary).toEqual({ requested: 3, matched: 1, missing: 2 });
	});

	test("accepts the payload via --branches-json", async () => {
		const run = runWithGithub(["exec", "map-branch-prs", "--branches-json", JSON.stringify({ branches: ["feature-a"] }), "--format", "json"], {
			github: stackedGithub(),
		});
		expect(await run.exit).toBe(0);
		expect(parseEnvelope(run).data?.branch_prs.map((entry) => entry.branch)).toEqual(["feature-a"]);
	});

	test("breaks shared-head-branch ties by choosing the lowest PR number", async () => {
		const github = new InMemoryPrAddressGitHubGateway({
			prs: [
				prSummary({ number: 30, head_ref_name: "feature-shared" }),
				prSummary({ number: 21, head_ref_name: "feature-shared" }),
			],
		});
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], {
			github,
			stdin: JSON.stringify({ branches: ["feature-shared"] }),
		});
		expect(await run.exit).toBe(0);
		expect(parseEnvelope(run).data?.branch_prs.map((entry) => entry.pr_number)).toEqual([21]);
	});

	test("rejects duplicate branches with invalid_request", async () => {
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], {
			github: stackedGithub(),
			stdin: JSON.stringify({ branches: ["feature-a", "feature-a"] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toBe("map-branch-prs branches contain duplicates: feature-a");
	});

	test("rejects an empty branches array with invalid_request", async () => {
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], {
			github: stackedGithub(),
			stdin: JSON.stringify({ branches: [] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toBe("map-branch-prs requires at least one branch.");
	});

	test("rejects blank branch names with invalid_request", async () => {
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], {
			github: stackedGithub(),
			stdin: JSON.stringify({ branches: ["feature-a", "  "] }),
		});
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).message).toBe("map-branch-prs requires every branch to be non-empty.");
	});

	test("rejects empty stdin with invalid_request", async () => {
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], { github: stackedGithub(), stdin: "" });
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).error_type).toBe("invalid_request");
	});

	test("rejects malformed JSON with invalid_json", async () => {
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], { github: stackedGithub(), stdin: "{not json" });
		expect(await run.exit).toBe(2);
		expect(parseEnvelope(run).error_type).toBe("invalid_json");
	});

	test("rejects an unexpected positional argument with a commander usage error", async () => {
		// PINNED CLINKR SEMANTICS: excess arguments are a raw commander usage
		// error (stderr, exit 2), never a machine envelope — click parity.
		const run = runWithGithub(["exec", "map-branch-prs", "extra", "--format", "json"], { github: stackedGithub() });
		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: too many arguments for 'map-branch-prs'. Expected 0 arguments but got 1.\n");
	});

	test("maps a gh listing failure to pr_gateway_failure", async () => {
		const github = new InMemoryPrAddressGitHubGateway({
			listOpenPrsFailure: { stderr: "gh: network down", stdout: "", returncode: 1 },
		});
		const run = runWithGithub(["exec", "map-branch-prs", "--format", "json"], {
			github,
			stdin: JSON.stringify({ branches: ["feature-a"] }),
		});
		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("pr_gateway_failure");
		expect(envelope.message).toBe("Failed to list open PRs: gh: network down");
	});

});
