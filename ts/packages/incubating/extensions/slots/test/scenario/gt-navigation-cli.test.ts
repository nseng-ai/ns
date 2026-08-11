import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { describe, expect, it } from "vitest";

import { runFilesystemScenario } from "../support/run-filesystem-scenario.ts";
import { slotWorktree } from "../support/scenario-fixture.ts";

function parseFilesystemJsonOutput(run: { readonly stdout: readonly string[] }): unknown {
	return JSON.parse(run.stdout.join(""));
}

describe("slot gt navigation CLI", () => {
	it("shows gt commands while hiding the exec subgroup", async () => {
		const root = runFilesystemScenario(["--help"]);
		expect(await root.exit).toBe(0);
		expect(root.stdout.join("")).toContain("gt");
		const gt = runFilesystemScenario(["gt", "--help"]);
		expect(await gt.exit).toBe(0);
		expect(gt.stdout.join("")).toContain("Graphite-aware slot navigation and stack operations.");
		expect(gt.stdout.join("")).not.toContain("exec");

		for (const command of ["up", "down"]) {
			const navigation = runFilesystemScenario(["gt", command, "--help"]);
			expect(await navigation.exit).toBe(0);
			expect(navigation.stdout.join("")).toContain("--no-clipboard");
		}
	});

	it("does not invoke the Graphite gateway for plain commands", async () => {
		const run = runFilesystemScenario(["list", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(0);
		expect(run.gt.operations()).toEqual([]);
	});

	it("gt up reuses an existing upstack slot worktree", async () => {
		const run = runFilesystemScenario(["gt", "up", "--format", "json"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-01", "feature/child"),
				],
			},
			gt: { children: { type: "children", branches: ["feature/child"] } },
		});
		expect(await run.exit).toBe(0);
		const output = parseFilesystemJsonOutput(run);
		expect(output).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: "feature/child",
				alreadyAssigned: true,
				cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
			},
		});
		expect(output).not.toMatchObject({ data: { is_already_assigned: expect.anything() } });
		expect(run.gt.operations()).toEqual([{ type: "children-of", cwd: "/repo" }]);
		expect(run.git.operations()).toEqual([]);
	});

	it("gt down checks out the parent into an available slot", async () => {
		const run = runFilesystemScenario(["gt", "down", "--no-clipboard", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/parent", "feature/current"],
				worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-01")],
			},
			gt: { parent: { type: "parent", branch: "feature/parent" } },
		});
		expect(await run.exit).toBe(0);
		const output = parseFilesystemJsonOutput(run);
		expect(output).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: "feature/parent",
				alreadyAssigned: false,
				clipboardSkipped: true,
			},
		});
		expect(output).not.toMatchObject({
			data: {
				is_already_assigned: expect.anything(),
				is_clipboard_skipped: expect.anything(),
				was_clipboard_skipped: expect.anything(),
			},
		});
		expect(run.git.operations()).toEqual([
			{
				type: "checkout-branch",
				path: "/slots/repos/repo/worktrees/slot-01",
				branch: "feature/parent",
			},
		]);
	});

	it("renders house-style human navigation output", async () => {
		const run = runFilesystemScenario(["gt", "up"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-01", "feature/child"),
				],
			},
			gt: { children: { type: "children", branches: ["feature/child"] } },
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ slot-01 -> feature/child",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
	});

	it("renders checked-out, main-worktree, and no-clipboard navigation variants", async () => {
		const checkedOut = runFilesystemScenario(["gt", "down", "--no-clipboard"], {
			git: {
				localBranches: ["master", "feature/parent", "feature/current"],
				worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-01")],
			},
			gt: { parent: { type: "parent", branch: "feature/parent" } },
		});
		expect(await checkedOut.exit).toBe(0);
		expect(stripAnsi(checkedOut.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ Checked out slot-01 -> feature/parent",
			"cd /slots/repos/repo/worktrees/slot-01",
		]);

		const main = runFilesystemScenario(["gt", "down"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/parent" },
					slotWorktree("slot-01", "feature/current"),
				],
			},
			cwd: "/slots/repos/repo/worktrees/slot-01",
			gt: { parent: { type: "parent", branch: "feature/parent" } },
		});
		expect(await main.exit).toBe(0);
		expect(stripAnsi(main.stdout.join("")).trimEnd().split("\n")[0]).toBe(
			"✓ feature/parent is checked out at /repo",
		);
	});

	it("gt down reports a missing parent as a negative exit", async () => {
		const run = runFilesystemScenario(["gt", "down", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { parent: { type: "no_parent" } },
		});
		expect(await run.exit).toBe(1);
		expect(parseFilesystemJsonOutput(run)).toMatchObject({
			exitCode: 1,
			message: "No downstack branch for 'feature/current'.",
		});
	});

	it("gt up reports multiple children as a negative exit", async () => {
		const run = runFilesystemScenario(["gt", "up", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { children: { type: "children", branches: ["feature/a", "feature/b"] } },
		});
		expect(await run.exit).toBe(1);
		expect(parseFilesystemJsonOutput(run)).toMatchObject({
			exitCode: 1,
			message:
				"Multiple upstack branches for 'feature/current': feature/a, feature/b. Run `ns slot checkout <branch>` for the branch you want.",
		});
	});
});
