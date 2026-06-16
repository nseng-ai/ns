import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { PRDiscussionComment, PRReview, PRReviewThread, PRSummary, RestructuredFile } from "../../src/gateways.ts";
import { InMemoryPrAddressGitGateway, InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";
import { fixedClock, runScenario } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

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

const makeTempDir = useTempDirs();

async function makePayloadRoot(): Promise<string> {
	return join(await makeTempDir("pr-address-prepare-run-"), "payload-root");
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

function withFullStdout(args: readonly string[]): string[] {
	return args.includes("--stdout-mode") ? [...args] : [...args, "--stdout-mode", "full"];
}

function gitGatewayFor(variant: GitVariant): InMemoryPrAddressGitGateway {
	if (variant === "detached") return new InMemoryPrAddressGitGateway({ currentBranch: null });
	if (variant === "branch-failure") {
		return new InMemoryPrAddressGitGateway({ currentBranchFailure: { code: "gateway_failed", message: "fatal: not a git repository", stderr: "fatal: not a git repository\n", stdout: "", returncode: 128 } });
	}
	if (variant === "restructured-failure") {
		return new InMemoryPrAddressGitGateway({
			currentBranch: "feature",
			restructuredFilesFailure: { code: "gateway_failed", message: "fatal: bad revision 'origin/master...HEAD'", stderr: "fatal: bad revision 'origin/master...HEAD'\n", stdout: "", returncode: 128 },
		});
	}
	return new InMemoryPrAddressGitGateway({ currentBranch: "feature", restructuredFiles: fixture.gateway.restructured_files });
}

describe("prepare-run golden contract", () => {
	for (const prepareCase of fixture.cases) {
		test(`matches the captured envelope for ${prepareCase.name}`, async () => {
			let env: NodeJS.ProcessEnv = { PATH: "/fake/bin" };
			let root: string | null = null;
			if (prepareCase.payload_env !== null) {
				root = await makePayloadRoot();
				env = prepareCase.payload_env === "session" ? { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: fixture.session_id } : { ASDL_PAYLOAD_ROOT: root };
			}

			const run = runScenario(["exec", ...withFullStdout(prepareCase.args)], {
				github: githubGatewayFor(prepareCase.github),
				git: gitGatewayFor(prepareCase.git),
				env,
				payloadClock: fixedClock(fixture.clock_iso),
			});

			expect(await run.exit).toBe(prepareCase.expected_exit_code);
			const expectedEnvelope = root === null ? prepareCase.expected_envelope_text : prepareCase.expected_envelope_text.replaceAll("{ROOT}", root);
			expect(run.stdout.join("")).toBe(expectedEnvelope);
			if (prepareCase.artifact_relative_path !== undefined && prepareCase.expected_artifact_text !== undefined && root !== null) {
				expect(await readFile(join(root, prepareCase.artifact_relative_path), "utf8")).toBe(prepareCase.expected_artifact_text);
			}
		});
	}

	test("compact payload mode writes a PR manifest artifact usable by classification-template", async () => {
		const root = await makePayloadRoot();
		const env = { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: fixture.session_id };
		const prepareRun = runScenario(["exec", "prepare-run", "--format", "json"], {
			github: githubGatewayFor("default"),
			git: gitGatewayFor("default"),
			env,
			payloadClock: fixedClock(fixture.clock_iso),
		});

		expect(await prepareRun.exit).toBe(0);
		const prepareEnvelope = JSON.parse(prepareRun.stdout.join("")) as {
			data: { artifacts: { produced: Array<{ kind: string; reference: { payload_path: string; descriptor: string; role: string } }> } };
		};
		const manifestArtifact = prepareEnvelope.data.artifacts.produced.find((artifact) => artifact.kind === "manifest") ?? null;
		expect(manifestArtifact?.reference).toMatchObject({ descriptor: "pr-address-pr-42-manifest", role: "summary" });
		const manifest = JSON.parse(await readFile(manifestArtifact?.reference.payload_path ?? "", "utf8")) as { found: boolean; number: number; pr_number: number };
		expect(manifest).toMatchObject({ found: true, number: 42, pr_number: 42 });

		const templateRun = runScenario(["exec", "classification-template", "--pr-number", "42", "--format", "json", "--stdout-mode", "full"], { env });
		expect(await templateRun.exit).toBe(0);
		const templateEnvelope = JSON.parse(templateRun.stdout.join("")) as { data: { manifest_kind: string; pr_number: number } };
		expect(templateEnvelope.data).toMatchObject({ manifest_kind: "prepare_run", pr_number: 42 });
	});

	test("reopens only contested threads through the mutation gateway", async () => {
		const root = await makePayloadRoot();
		const github = githubGatewayFor("default");
		const run = runScenario(["exec", "prepare-run", "--format", "json"], {
			github,
			git: gitGatewayFor("default"),
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: fixture.session_id },
			payloadClock: fixedClock(fixture.clock_iso),
		});

		expect(await run.exit).toBe(0);
		expect(github.unresolvedThreadIds).toEqual(["PRRT_contested"]);
	});

	test("records no reopens when the unresolve mutation fails", async () => {
		const github = githubGatewayFor("unresolve-failure");
		const run = runScenario(["exec", "prepare-run", "--format", "json", "--payload-mode", "inline", "--stdout-mode", "full"], {
			github,
			git: gitGatewayFor("default"),
			env: { PATH: "/fake/bin" },
			payloadClock: fixedClock(fixture.clock_iso),
		});

		expect(await run.exit).toBe(0);
		expect(github.unresolvedThreadIds).toEqual([]);
	});
});
