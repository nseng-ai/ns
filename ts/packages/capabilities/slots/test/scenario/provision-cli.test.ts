import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const STORE_ROOT = "/slots/repos/repo/provision/default";
const SLOT_01 = slotWorktree("slot-01").path;
const SLOT_02 = slotWorktree("slot-02").path;
const DECLARED_ENV = '[slots]\nprovision = [".env.local"]\n';

describe("slot provision CLI surface", () => {
	it("lists apply and import in provision group help", async () => {
		const run = runScenario(["provision", "--help"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("apply");
		expect(output).toContain("import");
	});

	it("documents --force in apply help and PATHS in import help", async () => {
		const applyHelp = runScenario(["provision", "apply", "-h"]);
		expect(await applyHelp.exit).toBe(0);
		expect(applyHelp.stdout.join("")).toContain("--force");

		const importHelp = runScenario(["provision", "import", "-h"]);
		expect(await importHelp.exit).toBe(0);
		expect(importHelp.stdout.join("")).toContain("paths");
	});
});

describe("slot provision apply CLI", () => {
	it("fills gaps across managed slots and reports machine entries", async () => {
		const run = runScenario(["provision", "apply", "--format", "json"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "master" },
					slotWorktree("slot-01"),
					slotWorktree("slot-02"),
				],
			},
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: {
					[`${STORE_ROOT}/.env.local`]: "SECRET=1\n",
					[`${SLOT_02}/.env.local`]: "SECRET=1\n",
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				storeRoot: STORE_ROOT,
				copiedCount: 1,
				upToDateCount: 1,
				differsCount: 0,
				entries: [
					{ slotName: "slot-01", path: ".env.local", action: "copied" },
					{ slotName: "slot-02", path: ".env.local", action: "up-to-date" },
				],
			},
		});
		expect(run.provisionFiles.operations()).toEqual([
			{
				type: "copy-into-worktree",
				from: `${STORE_ROOT}/.env.local`,
				to: `${SLOT_01}/.env.local`,
			},
		]);
	});

	it("renders a human table with paths only", async () => {
		const run = runScenario(["provision", "apply"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")] },
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		expect(await run.exit).toBe(0);
		const output = stripAnsi(run.stdout.join(""));
		expect(output).toContain("Provisioned 1 file(s).");
		expect(output).toContain("ACTION");
		expect(output).toContain("SLOT");
		expect(output).toContain("FILE");
		expect(output).toContain(".env.local");
		expect(output).not.toContain("SECRET=1");
	});

	it("reports differing copies, leaves them untouched, and exits 1", async () => {
		const run = runScenario(["provision", "apply", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")] },
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: {
					[`${STORE_ROOT}/.env.local`]: "SECRET=1\n",
					[`${SLOT_01}/.env.local`]: "LOCAL=EDIT\n",
				},
			},
		});
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "negative",
			data: {
				differsCount: 1,
				entries: [{ slotName: "slot-01", path: ".env.local", action: "differs" }],
			},
		});
		expect(run.provisionFiles.fileAt(`${SLOT_01}/.env.local`)).toEqual({
			content: "LOCAL=EDIT\n",
		});
	});

	it("overwrites differing copies with --force and exits 0", async () => {
		const run = runScenario(["provision", "apply", "--force", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")] },
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: {
					[`${STORE_ROOT}/.env.local`]: "SECRET=1\n",
					[`${SLOT_01}/.env.local`]: "LOCAL=EDIT\n",
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { overwrittenCount: 1, differsCount: 0 },
		});
		expect(run.provisionFiles.fileAt(`${SLOT_01}/.env.local`)).toEqual({
			content: "SECRET=1\n",
		});
	});

	it("fails with the config error code on invalid declarations", async () => {
		const run = runScenario(["provision", "apply", "--format", "json"], {
			provisionFiles: { projectConfigByRoot: { "/repo": '[slots]\nprovision = ["/abs"]\n' } },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "invalid-provision-path" });
	});
});

describe("slot provision import CLI", () => {
	it("imports an explicit declared path from the current worktree", async () => {
		const run = runScenario(["provision", "import", ".env.local", "--format", "json"], {
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: { "/repo/.env.local": "SECRET=1\n" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				storeRoot: STORE_ROOT,
				sourceRoot: "/repo",
				createdCount: 1,
				entries: [{ path: ".env.local", action: "created" }],
			},
		});
		expect(run.provisionFiles.fileAt(`${STORE_ROOT}/.env.local`)).toEqual({
			content: "SECRET=1\n",
		});
	});

	it("imports all declared files when no paths are passed and keeps missing ones exit 0", async () => {
		const run = runScenario(["provision", "import", "--format", "json"], {
			provisionFiles: {
				projectConfigByRoot: { "/repo": '[slots]\nprovision = ["a.env", "b.env"]\n' },
				files: { "/repo/a.env": "A\n" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				createdCount: 1,
				missingCount: 1,
				entries: [
					{ path: "a.env", action: "created" },
					{ path: "b.env", action: "missing-in-worktree" },
				],
			},
		});
	});

	it("rejects undeclared explicit paths with exit 2", async () => {
		const run = runScenario(["provision", "import", "secret.env", "--format", "json"], {
			provisionFiles: { projectConfigByRoot: { "/repo": DECLARED_ENV } },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "not-declared" });
		expect(run.provisionFiles.operations()).toEqual([]);
	});
});

describe("placement provisioning", () => {
	it("provisions created slots during init", async () => {
		const run = runScenario(["init", "--size", "2", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }], trunkBranch: "master" },
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				created: ["slot-01", "slot-02"],
				provision: {
					copied: [
						{ slotName: "slot-01", path: ".env.local" },
						{ slotName: "slot-02", path: ".env.local" },
					],
					notices: [],
				},
			},
		});
		expect(run.provisionFiles.operations()).toEqual([
			{ type: "copy-into-worktree", from: `${STORE_ROOT}/.env.local`, to: `${SLOT_01}/.env.local` },
			{ type: "copy-into-worktree", from: `${STORE_ROOT}/.env.local`, to: `${SLOT_02}/.env.local` },
		]);
	});

	it("reports provision null when nothing is declared", async () => {
		const run = runScenario(["init", "--size", "1", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { provision: null } });
	});

	it("provisions the target slot during checkout, including reuse", async () => {
		const fresh = runScenario(["checkout", "feature/a", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		expect(await fresh.exit).toBe(0);
		expect(parseJsonOutput(fresh)).toMatchObject({
			data: {
				slotName: "slot-01",
				provision: { copied: [{ slotName: "slot-01", path: ".env.local" }], notices: [] },
			},
		});

		const reuse = runScenario(["checkout", "feature/a", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01", "feature/a")],
			},
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		expect(await reuse.exit).toBe(0);
		expect(parseJsonOutput(reuse)).toMatchObject({
			data: {
				alreadyAssigned: true,
				provision: { copied: [{ slotName: "slot-01", path: ".env.local" }], notices: [] },
			},
		});
	});

	it("does not provision when the branch lives in the main worktree", async () => {
		const run = runScenario(["checkout", "master", "--format", "json"], {
			git: {
				localBranches: ["master"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { provision: null } });
		expect(run.provisionFiles.operations()).toEqual([]);
	});

	it("provisions the target slot during claim and surfaces notices", async () => {
		const run = runScenario(["claim", "feature/a", "--format", "json"], {
			cwd: SLOT_01,
			git: {
				localBranches: ["master", "feature/a"],
				repositoryRoot: SLOT_01,
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
			provisionFiles: { projectConfigByRoot: { "/repo": DECLARED_ENV } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-01",
				provision: {
					copied: [],
					notices: [{ kind: "missing-in-store", path: ".env.local", slotName: "slot-01" }],
				},
			},
		});
	});

	it("keeps claim successful when reading project config fails", async () => {
		const run = runScenario(["claim", "feature/a", "--format", "json"], {
			cwd: SLOT_01,
			git: {
				localBranches: ["master", "feature/a"],
				repositoryRoot: SLOT_01,
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
			provisionFiles: { projectConfigReadFailures: { "/repo": "config unavailable" } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-01",
				provision: {
					copied: [],
					notices: [
						{
							kind: "config-error",
							path: null,
							slotName: null,
							message: "config unavailable",
						},
					],
				},
			},
		});
		expect(run.git.operations()).toContainEqual({
			type: "checkout-branch",
			path: SLOT_01,
			branch: "feature/a",
		});
	});

	it("keeps human placement output stable when nothing is declared", async () => {
		const run = runScenario(["checkout", "feature/a"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ Checked out slot-01 -> feature/a",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
	});

	it("renders provisioned lines in human placement output", async () => {
		const run = runScenario(["checkout", "feature/a"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		expect(await run.exit).toBe(0);
		const output = stripAnsi(run.stdout.join(""));
		expect(output).toContain("Provisioned: .env.local -> slot-01");
		expect(output).not.toContain("SECRET=1");
	});
});
