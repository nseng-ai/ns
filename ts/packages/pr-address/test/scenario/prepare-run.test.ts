import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { PayloadClock } from "../../src/payload-store.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PRSummary, RestructuredFile } from "../../src/gateways.ts";
import { InMemoryPrAddressGitGateway, InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";

type GithubVariant = "default" | "no-pr" | "lookup-failure" | "unresolve-failure";
type GitVariant = "default" | "detached" | "branch-failure" | "restructured-failure";

interface PrepareRunFixtureCase {
	name: string;
	args: string[];
	github: GithubVariant;
	git: GitVariant;
	payload_env: "session" | "root-only" | null;
	expected_exit_code: number;
	expected_envelope_text: string;
	artifact_relative_path?: string;
	expected_artifact_text?: string;
}

interface PrepareRunFixture {
	clock_iso: string;
	session_id: string;
	gateway: {
		pr: PRSummary;
		reviews: PRReview[];
		review_threads: PRReviewThread[];
		discussion_comments: PRDiscussionComment[];
		restructured_files: RestructuredFile[];
	};
	cases: PrepareRunFixtureCase[];
}

const fixture = JSON.parse(await readFile(new URL("../fixtures/prepare-run/prepare-run.json", import.meta.url), "utf8")) as PrepareRunFixture;

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makePayloadRoot(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-prepare-run-"));
	tempDirs.push(dir);
	return join(dir, "payload-root");
}

function fixedClock(iso: string): PayloadClock {
	const instant = new Date(iso);
	return () => instant;
}

function githubGatewayFor(variant: GithubVariant): InMemoryPrAddressGitHubGateway {
	if (variant === "no-pr") return new InMemoryPrAddressGitHubGateway();
	if (variant === "lookup-failure") return new InMemoryPrAddressGitHubGateway({ lookupFailureBranches: new Set(["feature"]) });
	return new InMemoryPrAddressGitHubGateway({
		prsByBranch: { feature: fixture.gateway.pr },
		reviews: { [fixture.gateway.pr.number]: fixture.gateway.reviews },
		reviewThreads: { [fixture.gateway.pr.number]: fixture.gateway.review_threads },
		discussionComments: { [fixture.gateway.pr.number]: fixture.gateway.discussion_comments },
		unresolveFailureIds: variant === "unresolve-failure" ? new Set(["PRRT_contested"]) : undefined,
	});
}

function gitGatewayFor(variant: GitVariant): InMemoryPrAddressGitGateway {
	if (variant === "detached") return new InMemoryPrAddressGitGateway({ currentBranch: null });
	if (variant === "branch-failure") {
		return new InMemoryPrAddressGitGateway({ currentBranchFailure: { stderr: "fatal: not a git repository\n", stdout: "", returncode: 128 } });
	}
	if (variant === "restructured-failure") {
		return new InMemoryPrAddressGitGateway({
			currentBranch: "feature",
			restructuredFilesFailure: { stderr: "fatal: bad revision 'origin/master...HEAD'\n", stdout: "", returncode: 128 },
		});
	}
	return new InMemoryPrAddressGitGateway({ currentBranch: "feature", restructuredFiles: fixture.gateway.restructured_files });
}

interface ManagedRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	github: InMemoryPrAddressGitHubGateway;
}

function runManaged(args: readonly string[], options: { github: InMemoryPrAddressGitHubGateway; git: InMemoryPrAddressGitGateway; env: NodeJS.ProcessEnv }): ManagedRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			context: { github: options.github, git: options.git, payloadClock: fixedClock(fixture.clock_iso) },
			cwd: "/repo",
			env: options.env,
			stdin: async () => "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		github: options.github,
	};
}

describe("prepare-run parity with the Python CLI", () => {
	for (const prepareCase of fixture.cases) {
		test(`matches the Python envelope for ${prepareCase.name}`, async () => {
			let env: NodeJS.ProcessEnv = { PATH: "/fake/bin" };
			let root: string | null = null;
			if (prepareCase.payload_env !== null) {
				root = await makePayloadRoot();
				env = prepareCase.payload_env === "session" ? { ASDL_PAYLOAD_ROOT: root, ASDL_PAYLOAD_SESSION_ID: fixture.session_id } : { ASDL_PAYLOAD_ROOT: root };
			}

			const run = runManaged(["exec", ...prepareCase.args], {
				github: githubGatewayFor(prepareCase.github),
				git: gitGatewayFor(prepareCase.git),
				env,
			});

			expect(await run.exit).toBe(prepareCase.expected_exit_code);
			const expectedEnvelope = root === null ? prepareCase.expected_envelope_text : prepareCase.expected_envelope_text.replaceAll("{ROOT}", root);
			expect(run.stdout.join("")).toBe(expectedEnvelope);
			if (prepareCase.artifact_relative_path !== undefined && prepareCase.expected_artifact_text !== undefined && root !== null) {
				expect(await readFile(join(root, prepareCase.artifact_relative_path), "utf8")).toBe(prepareCase.expected_artifact_text);
			}
		});
	}

	test("reopens only contested threads through the mutation gateway", async () => {
		const root = await makePayloadRoot();
		const run = runManaged(["exec", "prepare-run", "--format", "json"], {
			github: githubGatewayFor("default"),
			git: gitGatewayFor("default"),
			env: { ASDL_PAYLOAD_ROOT: root, ASDL_PAYLOAD_SESSION_ID: fixture.session_id },
		});

		expect(await run.exit).toBe(0);
		expect(run.github.unresolvedThreadIds).toEqual(["PRRT_contested"]);
	});

	test("records no reopens when the unresolve mutation fails", async () => {
		const run = runManaged(["exec", "prepare-run", "--format", "json", "--payload-mode", "inline"], {
			github: githubGatewayFor("unresolve-failure"),
			git: gitGatewayFor("default"),
			env: { PATH: "/fake/bin" },
		});

		expect(await run.exit).toBe(0);
		expect(run.github.unresolvedThreadIds).toEqual([]);
	});

	test("rejects invalid payload modes natively", async () => {
		const run = runManaged(["exec", "prepare-run", "--payload-mode", "bogus", "--format", "json"], {
			github: githubGatewayFor("default"),
			git: gitGatewayFor("default"),
			env: { PATH: "/fake/bin" },
		});

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("--payload-mode");
	});
});
