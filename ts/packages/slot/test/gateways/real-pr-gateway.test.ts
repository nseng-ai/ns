import { describe, expect, it } from "vitest";

import { ScriptedCommandExecApi } from "@asdl/core/testing";
import type { SlotCommandDiagnosticEvent, SlotDiagnosticSink } from "../../src/diagnostics.ts";
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

	it("emits labeled gh diagnostics for batch lookup", async () => {
		const execApi = new ScriptedCommandExecApi([
			{ stdout: JSON.stringify({ nameWithOwner: "dagster-io/asdl-tools" }) },
			{ stdout: JSON.stringify({ data: { repository: { b0: { nodes: [] } } } }) },
		]);
		const diagnosticSink = new InMemoryDiagnosticSink();
		const gateway = new RealSlotPrGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi, diagnosticSink });

		expect(await gateway.getPrsForBranches(["feature/no-pr"])).toMatchObject({ type: "ok" });
		expect(diagnosticSink.events()).toEqual([
			expect.objectContaining({
				type: "slot.command",
				operation: "slot.pr.resolve_repository",
				command: "gh",
				args: ["repo", "view", "--json", "nameWithOwner"],
				displayCommand: "gh repo view --json nameWithOwner",
				cwd: "/repo",
				timeoutMs: 10_000,
				exitCode: 0,
				killed: false,
			}),
			expect.objectContaining({
				type: "slot.command",
				operation: "slot.pr.batch_lookup",
				command: "gh",
				args: expect.arrayContaining(["api", "graphql", "-F"]),
				cwd: "/repo",
				timeoutMs: 10_000,
				exitCode: 0,
				killed: false,
			}),
		]);
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

class InMemoryDiagnosticSink implements SlotDiagnosticSink {
	private readonly log: SlotCommandDiagnosticEvent[] = [];

	recordCommand(event: SlotCommandDiagnosticEvent): void {
		this.log.push(event);
	}

	events(): readonly SlotCommandDiagnosticEvent[] {
		return this.log.map((event) => ({ ...event, args: [...event.args] }));
	}
}
