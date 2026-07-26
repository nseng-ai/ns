import { describe, expect, test } from "vitest";

import { ScriptedCommandExecApi, exitedResult } from "@nseng-ai/foundation/exec/testing";
import {
	createFlowBranchPublicationClient,
	type FlowBranchPublicationClient,
} from "@nseng-ai/flow/api";

const HEAD = "a".repeat(40);
const PUBLISHED_HEAD = "b".repeat(40);

function pullRequest(headOid: string) {
	return JSON.stringify({
		number: 12,
		url: "https://github.com/acme/project/pull/12",
		body: "Human prose",
		headRefName: "feature/demo",
		headRefOid: headOid,
	});
}

describe("Flow publication Extension API", () => {
	test("binds publication mechanics to the caller-provided execution channel", async () => {
		const commands = new ScriptedCommandExecApi([
			exitedResult({ stdout: "feature/demo\n" }),
			exitedResult({ stdout: `${HEAD}\n` }),
			exitedResult({ stdout: `${pullRequest(HEAD)}\n` }),
		]);
		const client: FlowBranchPublicationClient = createFlowBranchPublicationClient({
			cwd: "/repo",
			commands,
		});

		expect(await client.resolveCurrentBranchTarget({ trunkBranch: "main" })).toMatchObject({
			type: "resolved",
			localHeadOid: HEAD,
			target: { branch: "feature/demo", pullRequest: { number: 12, headOid: HEAD } },
		});
		expect(commands.calls()).toEqual([
			{
				command: "git",
				args: ["symbolic-ref", "--quiet", "--short", "HEAD"],
				options: { cwd: "/repo", timeout: 60_000 },
			},
			{
				command: "git",
				args: ["rev-parse", "HEAD"],
				options: { cwd: "/repo", timeout: 60_000 },
			},
			{
				command: "gh",
				args: ["pr", "view", "--json", "number,url,body,headRefName,headRefOid"],
				options: { cwd: "/repo", timeout: 60_000 },
			},
		]);
	});

	test("pins the push source to the verified commit without changing execution channels", async () => {
		const commands = new ScriptedCommandExecApi([
			exitedResult({ stdout: "feature/demo\n" }),
			exitedResult({ stdout: `${PUBLISHED_HEAD}\n` }),
			exitedResult({ stdout: `${pullRequest(HEAD)}\n` }),
			exitedResult(),
			exitedResult({ stdout: `${pullRequest(PUBLISHED_HEAD)}\n` }),
			exitedResult(),
		]);
		const client = createFlowBranchPublicationClient({ cwd: "/repo", commands });

		expect(
			await client.publishBoundBranch({
				target: {
					branch: "feature/demo",
					pullRequest: {
						number: 12,
						url: "https://github.com/acme/project/pull/12",
						headRefName: "feature/demo",
						headOid: HEAD,
					},
				},
				expectedHeadOid: PUBLISHED_HEAD,
				objectiveSlug: "demo-objective",
				managedBody: "## Objective Runner\n\nFacts",
			}),
		).toMatchObject({ type: "published", headOid: PUBLISHED_HEAD });
		const calls = commands.calls();
		expect(calls[3]).toEqual({
			command: "git",
			args: ["push", "origin", `${PUBLISHED_HEAD}:refs/heads/feature/demo`],
			options: { cwd: "/repo", timeout: 120_000 },
		});
		expect(calls[5]).toMatchObject({
			command: "gh",
			args: ["pr", "edit", "12", "--body-file", expect.any(String)],
			options: { cwd: "/repo", timeout: 60_000 },
		});
	});
});
