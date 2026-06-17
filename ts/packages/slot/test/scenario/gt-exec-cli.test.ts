import { describe, expect, it } from "vitest";

import { fakeStackInfo } from "../../src/gateways/fakes/gt.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("slot gt exec stack-branches CLI", () => {
	it("is hidden but invocable and emits compact branch JSON in human mode", async () => {
		const run = runScenario(["gt", "exec", "stack-branches"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { stack: { type: "stack", stack: fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master", "feature/a"], descendants: ["feature/c"] }) } },
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe('{"branches":["feature/a","feature/current","feature/c"]}\n');
	});

	it("returns the full envelope in JSON mode", async () => {
		const run = runScenario(["gt", "exec", "stack-branches", "--downstack", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { stack: { type: "stack", stack: fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master", "feature/a"], descendants: ["feature/c"] }) } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { branches: ["feature/a", "feature/current"], scope: "downstack", edges: [{ parent: "master", child: "feature/a" }, { parent: "feature/a", child: "feature/current" }] } });
	});

	it("returns a negative result on trunk", async () => {
		const run = runScenario(["gt", "exec", "stack-branches", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }] },
			gt: { stack: { type: "stack", stack: fakeStackInfo({ trunk: "master", current: "master", ancestors: [], descendants: [] }) } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ exit_code: 1, message: "On trunk 'master'; no stack is checked out.", data: { branches: [] } });
	});

	it("fails forked full-stack metadata but only warns for downstack scope", async () => {
		const stack = fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master"], descendants: ["feature/a"], descendantWalk: { forks: [{ branch: "feature/current", children: ["feature/a", "feature/b"] }], childrenCorruptions: [], termination: { type: "completed" } } });
		const full = runScenario(["gt", "exec", "stack-branches", "--format", "json"], { git: { worktrees: [{ path: "/repo", branch: "feature/current" }] }, gt: { stack: { type: "stack", stack } } });
		expect(await full.exit).toBe(2);
		expect(parseJsonOutput(full)).toMatchObject({ error_type: "forked_stack" });
		const down = runScenario(["gt", "exec", "stack-branches", "--downstack"], { git: { worktrees: [{ path: "/repo", branch: "feature/current" }] }, gt: { stack: { type: "stack", stack } } });
		expect(await down.exit).toBe(0);
		expect(down.stderr.join("")).toContain("branch feature/current has 2 Graphite children");
	});
});
