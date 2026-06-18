import { describe, expect, it } from "vitest";

import { ScriptedCommandExecApi } from "@asdl/core/testing";
import { RealSlotPrGateway } from "../../src/gateways/pr.ts";

describe("RealSlotPrGateway", () => {
	it("looks up multiple branch PRs with one GraphQL batch request", async () => {
		const execApi = new ScriptedCommandExecApi([
			{ stdout: JSON.stringify({ nameWithOwner: "dagster-io/asdl-tools" }) },
			{ stdout: JSON.stringify({ data: { repository: { b0: { nodes: [{ number: 1, state: "MERGED", url: "https://github.example/pr/1", headRefName: "feature/done" }] }, b1: { nodes: [] } } } }) },
		]);
		const gateway = new RealSlotPrGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi });

		const result = await gateway.getPrsForBranches(["feature/done", "feature/no-pr"]);

		expect(result).toMatchObject({ type: "ok" });
		if (result.type !== "ok") return;
		expect([...result.resultsByBranch.entries()]).toEqual([
			["feature/done", { type: "found", pr: { number: 1, state: "MERGED", url: "https://github.example/pr/1", headRefName: "feature/done" } }],
			["feature/no-pr", { type: "miss" }],
		]);
		const calls = execApi.calls();
		expect(calls.map((call) => call.args.slice(0, 3))).toEqual([
			["repo", "view", "--json"],
			["api", "graphql", "-F"],
		]);
		expect(calls[1]?.args[3]).toContain('repository(owner: "dagster-io", name: "asdl-tools")');
		expect(calls[1]?.args[3]).toContain('b0: pullRequests(headRefName: "feature/done"');
		expect(calls[1]?.args[3]).toContain('b1: pullRequests(headRefName: "feature/no-pr"');
	});

	it("returns a batch failure for GraphQL errors", async () => {
		const execApi = new ScriptedCommandExecApi([
			{ stdout: JSON.stringify({ nameWithOwner: "dagster-io/asdl-tools" }) },
			{ stdout: JSON.stringify({ errors: [{ message: "bad query" }] }) },
		]);
		const gateway = new RealSlotPrGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi });

		expect(await gateway.getPrsForBranches(["feature/a"])).toMatchObject({ type: "failure", failure: { message: expect.stringContaining("GitHub GraphQL returned errors") } });
	});
});
