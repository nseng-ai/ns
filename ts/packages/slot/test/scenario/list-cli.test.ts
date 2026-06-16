import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot list CLI", () => {
	it("prints version and runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toContain("0.1.0");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toContain("runtime: typescript");
		expect(runtime.stdout.join("")).toContain("ts/packages/slot/src/cli.ts");
	});

	it("shows list, ls, init, and resize in help", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		for (const command of ["list", "ls", "init", "resize"]) expect(help).toContain(command);
	});

	it("renders an empty pool in human mode", async () => {
		const run = runScenario(["list"], { git: { worktrees: [{ path: "/repo", branch: "master" }] } });
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("No slots initialized for repo.");
	});

	it("renders assigned, available, and operation rows as JSON", async () => {
		const run = runScenario(["ls", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02", null), slotWorktree("slot-03", "feature/rebase")],
				branchOccupancies: [
					{ path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a", operation: "checked-out" },
					{ path: "/slots/repos/repo/worktrees/slot-03", branch: "feature/rebase", operation: "rebase" },
				],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			exit_code: 0,
			data: {
				pool_size: 3,
				repo_name: "repo",
				rows: [
					{ slot_name: "slot-01", branch: "feature/a", operation: null, status: "assigned" },
					{ slot_name: "slot-02", branch: null, operation: null, status: "available" },
					{ slot_name: "slot-03", branch: "feature/rebase", operation: "rebase", status: "assigned" },
				],
			},
		});
	});

	it("prints a JSON schema for machine consumers", async () => {
		const run = runScenario(["list", "--json-schema"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("pool_size");
	});
});
