import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const STORE_ROOT = "/slots/repos/repo/provision/default";
const DECLARED_ENV = '[slots]\nprovision = [".env.local"]\n';

describe("slot init CLI", () => {
	it("creates metadata dirs and detached worktrees from trunk", async () => {
		const run = runScenario(["init", "--size", "2", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }], trunkBranch: "main" },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				poolSize: 2,
				created: ["slot-01", "slot-02"],
				worktreesDir: "/slots/repos/repo/worktrees",
			},
		});
		expect(run.storage.operations()).toEqual([
			{ type: "ensure-dir", path: "/slots/repos/repo" },
			{ type: "ensure-dir", path: "/slots/repos/repo/worktrees" },
		]);
		expect(run.git.operations()).toEqual([
			{ type: "add-detached-worktree", path: "/slots/repos/repo/worktrees/slot-01", ref: "main" },
			{ type: "add-detached-worktree", path: "/slots/repos/repo/worktrees/slot-02", ref: "main" },
		]);
	});

	it("rejects invalid sizes", async () => {
		const run = runScenario(["init", "--size", "100", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "invalid-size" });
	});

	it("rejects already initialized pools", async () => {
		const run = runScenario(["init", "--size", "1", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", null)] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "pool-already-initialized" });
	});
});

describe("slot resize CLI", () => {
	it("grows sparse pools by filling absent slot numbers first and provisions only new slots", async () => {
		const slot01Path = slotWorktree("slot-01").path;
		const slot02Path = slotWorktree("slot-02").path;
		const slot04Path = slotWorktree("slot-04").path;
		const run = runScenario(["resize", "--size", "4", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", null), slotWorktree("slot-03", null)] },
			provisionFiles: {
				projectConfigByPath: { "/repo/ns.toml": DECLARED_ENV },
				files: {
					[`${STORE_ROOT}/.env.local`]: "SECRET=1\n",
					[`${slot01Path}/.env.local`]: "LOCAL=EDIT\n",
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				previousPoolSize: 2,
				poolSize: 4,
				created: ["slot-02", "slot-04"],
				removed: [],
				provision: {
					copied: [
						{ slotName: "slot-02", path: ".env.local" },
						{ slotName: "slot-04", path: ".env.local" },
					],
					notices: [],
				},
			},
		});
		expect(run.provisionFiles.operations()).toEqual([
			{
				type: "copy-into-worktree",
				from: `${STORE_ROOT}/.env.local`,
				to: `${slot02Path}/.env.local`,
			},
			{
				type: "copy-into-worktree",
				from: `${STORE_ROOT}/.env.local`,
				to: `${slot04Path}/.env.local`,
			},
		]);
		expect(run.provisionFiles.fileAt(`${slot01Path}/.env.local`)).toEqual({
			content: "LOCAL=EDIT\n",
		});
	});

	it("renders human grow output", async () => {
		const run = runScenario(["resize", "--size", "4"], {
			git: { worktrees: [slotWorktree("slot-01", null), slotWorktree("slot-03", null)] },
		});
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Grew slot pool 2 -> 4.");
		expect(output).toContain("Created slot-02");
		expect(output).toContain("Created slot-04");
		expect(output).toContain("Worktrees: /slots/repos/repo/worktrees");
	});

	it("shrinks by removing the highest records without provisioning", async () => {
		const run = runScenario(["resize", "--size", "2", "--format", "json"], {
			git: {
				worktrees: [
					slotWorktree("slot-01", null),
					slotWorktree("slot-02", null),
					slotWorktree("slot-03", null),
					slotWorktree("slot-04", null),
				],
			},
			provisionFiles: {
				projectConfigByPath: { "/repo/ns.toml": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				previousPoolSize: 4,
				poolSize: 2,
				created: [],
				removed: ["slot-03", "slot-04"],
				provision: null,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "remove-worktree", path: "/slots/repos/repo/worktrees/slot-03" },
			{ type: "remove-worktree", path: "/slots/repos/repo/worktrees/slot-04" },
		]);
		expect(run.provisionFiles.operations()).toEqual([]);
	});

	it("renders human shrink output", async () => {
		const run = runScenario(["resize", "--size", "2"], {
			git: {
				worktrees: [
					slotWorktree("slot-01", null),
					slotWorktree("slot-02", null),
					slotWorktree("slot-03", null),
					slotWorktree("slot-04", null),
				],
			},
		});
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Shrank slot pool 4 -> 2.");
		expect(output).toContain("Removed slot-03");
		expect(output).toContain("Removed slot-04");
	});

	it("returns no-op without provisioning when already at the requested size", async () => {
		const run = runScenario(["resize", "--size", "1", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", null)] },
			provisionFiles: {
				projectConfigByPath: { "/repo/ns.toml": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { previousPoolSize: 1, poolSize: 1, created: [], removed: [], provision: null },
		});
		expect(run.git.operations()).toEqual([]);
		expect(run.provisionFiles.operations()).toEqual([]);
	});

	it("renders human no-op output", async () => {
		const run = runScenario(["resize", "--size", "1"], {
			git: { worktrees: [slotWorktree("slot-01", null)] },
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Pool already at size 1.");
	});

	it("reports all unsafe shrink offenders", async () => {
		const run = runScenario(["resize", "--size", "1", "--format", "json"], {
			git: {
				worktrees: [
					slotWorktree("slot-01", null),
					slotWorktree("slot-02", "feature/a"),
					slotWorktree("slot-03", null),
					slotWorktree("slot-04", "feature/rebase"),
				],
				branchOccupancies: [
					{
						path: "/slots/repos/repo/worktrees/slot-02",
						branch: "feature/a",
						operation: "checked-out",
					},
					{
						path: "/slots/repos/repo/worktrees/slot-04",
						branch: "feature/rebase",
						operation: "rebase",
					},
				],
				dirtyPaths: ["/slots/repos/repo/worktrees/slot-03"],
			},
		});
		expect(await run.exit).toBe(2);
		const output = parseJsonOutput(run) as { message: string; errorType: string };
		expect(output.errorType).toBe("resize-unsafe");
		expect(output.message).toContain("slot-02 is assigned to 'feature/a'");
		expect(output.message).toContain(
			"slot-03 at /slots/repos/repo/worktrees/slot-03 has uncommitted changes",
		);
		expect(output.message).toContain("slot-04 is assigned to 'feature/rebase'");
	});
});
