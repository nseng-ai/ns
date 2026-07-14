import { describe, expect, test } from "vitest";

import type { FlowBranchPublicationClient } from "@nseng-ai/flow/api";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

import { createRealObjectiveRunnerPublicationFactsGateway } from "../../../src/publication/real-facts-gateway.ts";

const BASE_SHA = "1".repeat(40);
const RUNNER_SHA = "2".repeat(40);
const HEAD_SHA = "3".repeat(40);

class SequencedCommands implements CommandExecApi {
	readonly calls: Array<{ command: string; args: string[]; cwd: string | undefined }> = [];
	private readonly results: ExecResult[];

	constructor(results: ExecResult[]) {
		this.results = [...results];
	}

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], cwd: options.cwd });
		const result = this.results.shift();
		if (result === undefined) throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		return result;
	}
}

function exited(stdout = "", code = 0): ExecResult {
	return { type: "exited", stdout, stderr: "", code, signal: null };
}

function flowClient(): FlowBranchPublicationClient {
	return {
		resolveCurrentBranchTarget: async () => ({
			type: "resolved",
			localHeadOid: HEAD_SHA,
			target: {
				branch: "feature/publication",
				pullRequest: {
					number: 42,
					url: "https://github.com/nseng-ai/ns/pull/42",
					headRefName: "feature/publication",
					headOid: BASE_SHA,
				},
			},
		}),
		publishBoundBranch: async () => {
			throw new Error("read-facts adapter must never publish");
		},
	};
}

describe("real publication facts gateway", () => {
	test("reuses Flow target resolution and reads repository and clean state on one cwd", async () => {
		const commands = new SequencedCommands([
			exited("git@github.com:nseng-ai/ns.git\n"),
			exited(""),
		]);
		const gateway = createRealObjectiveRunnerPublicationFactsGateway({
			cwd: "/repo",
			trunkBranch: "main",
			commands,
			flow: flowClient(),
		});

		const result = await gateway.readPublicationTarget({ repoRoot: "/repo" });

		expect(result).toMatchObject({
			type: "found",
			value: {
				repository: "nseng-ai/ns",
				branch: "feature/publication",
				localHead: HEAD_SHA,
				isWorktreeClean: true,
				pullRequest: { number: 42, headSha: BASE_SHA },
			},
		});
		expect(commands.calls).toEqual([
			{ command: "git", args: ["remote", "get-url", "origin"], cwd: "/repo" },
			{ command: "git", args: ["status", "--porcelain=v1", "-z"], cwd: "/repo" },
		]);
	});

	test("returns ordered commit range and Objective-Runner-Step trailers", async () => {
		const commands = new SequencedCommands([
			exited(),
			exited(`${RUNNER_SHA}\n${HEAD_SHA}\n`),
			exited("objective-runner-external-writes\n"),
			exited(""),
		]);
		const gateway = createRealObjectiveRunnerPublicationFactsGateway({
			cwd: "/repo",
			trunkBranch: "main",
			commands,
			flow: flowClient(),
		});

		const result = await gateway.readPublicationCommits({
			repoRoot: "/repo",
			lastPublishedHead: BASE_SHA,
			intendedPublishedHead: HEAD_SHA,
		});

		expect(result).toEqual({
			ok: true,
			value: {
				lastPublishedHead: BASE_SHA,
				intendedPublishedHead: HEAD_SHA,
				isLastPublishedHeadAncestor: true,
				commits: [
					{
						sha: RUNNER_SHA,
						objectiveRunnerStepTrailers: ["objective-runner-external-writes"],
					},
					{ sha: HEAD_SHA, objectiveRunnerStepTrailers: [] },
				],
			},
		});
		expect(commands.calls[1]?.args).toEqual(["rev-list", "--reverse", `${BASE_SHA}..${HEAD_SHA}`]);
	});

	test("classifies merge-base exit one as non-descendant facts", async () => {
		const commands = new SequencedCommands([exited("", 1)]);
		const gateway = createRealObjectiveRunnerPublicationFactsGateway({
			cwd: "/repo",
			trunkBranch: "main",
			commands,
			flow: flowClient(),
		});

		const result = await gateway.readPublicationCommits({
			repoRoot: "/repo",
			lastPublishedHead: BASE_SHA,
			intendedPublishedHead: HEAD_SHA,
		});

		expect(result).toMatchObject({ ok: true, value: { isLastPublishedHeadAncestor: false } });
	});
});
