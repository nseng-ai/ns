import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createSlotClient } from "../../src/api/index.ts";
import { FakeClipboardGateway } from "../../src/core/gateways/clipboard.ts";
import { NS_CD_DIRECTIVE_FILE } from "../../src/core/shell/cd-directive.ts";
import { runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("Slot Capability API", () => {
	it("checks out the current branch and maps checkout outcome to camelCase", async () => {
		const run = runScenario([], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "feature/a" }, slotWorktree("slot-01")],
				previousBranches: { "/repo": "master" },
			},
		});

		const slotClient = createSlotClient({ cwd: "/repo", context: run.context });
		const result = await slotClient.checkoutCurrent();

		expect(result).toEqual({
			ok: true,
			target: {
				slotName: "slot-01",
				branchName: "feature/a",
				worktreePath: "/slots/repos/repo/worktrees/slot-01",
				isAlreadyAssigned: false,
				hasCreatedBranch: false,
				currentWorktreeNote: null,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/repo", branch: "master" },
			{
				type: "checkout-branch",
				path: "/slots/repos/repo/worktrees/slot-01",
				branch: "feature/a",
			},
		]);
	});

	it("checks out a named branch without clipboard operations", async () => {
		const run = runScenario([], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [slotWorktree("slot-01")],
			},
			clipboardResult: { type: "failure", reason: "subprocess-error", detail: "must not copy" },
		});

		const slotClient = createSlotClient({ cwd: "/repo", context: run.context });
		const result = await slotClient.checkoutBranch({ branchName: "feature/a" });
		const clipboard = run.context.clipboard;

		expect(result).toMatchObject({
			ok: true,
			target: {
				slotName: "slot-01",
				branchName: "feature/a",
				worktreePath: "/slots/repos/repo/worktrees/slot-01",
				isAlreadyAssigned: false,
				hasCreatedBranch: false,
				currentWorktreeNote: null,
			},
		});
		expect(clipboard).toBeInstanceOf(FakeClipboardGateway);
		if (clipboard instanceof FakeClipboardGateway) expect(clipboard.texts()).toEqual([]);
	});

	it("can opt into clipboard copy", async () => {
		const run = runScenario([], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [slotWorktree("slot-01")],
			},
		});

		const slotClient = createSlotClient({
			cwd: "/repo",
			context: run.context,
			sideEffects: { shouldCopyClipboard: true, shouldWriteCdDirective: false },
		});
		const result = await slotClient.checkoutBranch({ branchName: "feature/a" });
		const clipboard = run.context.clipboard;

		expect(result.ok).toBe(true);
		expect(clipboard).toBeInstanceOf(FakeClipboardGateway);
		if (clipboard instanceof FakeClipboardGateway) {
			expect(clipboard.texts()).toEqual(["cd /slots/repos/repo/worktrees/slot-01"]);
		}
	});

	it("can opt into cd directive writes", async () => {
		const home = await mkdtemp(join(tmpdir(), "slot-api-directive-"));
		try {
			const directivePath = join(home, "directive");
			const run = runScenario([], {
				env: { PATH: "/fake/bin", [NS_CD_DIRECTIVE_FILE]: directivePath },
				git: {
					localBranches: ["master", "feature/a"],
					worktrees: [slotWorktree("slot-01")],
				},
			});
			const slotClient = createSlotClient({
				cwd: "/repo",
				context: run.context,
				sideEffects: { shouldCopyClipboard: false, shouldWriteCdDirective: true },
			});

			const result = await slotClient.checkoutBranch({ branchName: "feature/a" });

			expect(result.ok).toBe(true);
			expect(await readFile(directivePath, "utf8")).toBe("/slots/repos/repo/worktrees/slot-01");
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});

	it("honors the side-effect cd directive flag independent of ctx.shouldWriteCdDirective", async () => {
		const home = await mkdtemp(join(tmpdir(), "slot-api-directive-ctx-"));
		try {
			const directivePath = join(home, "directive");
			const run = runScenario([], {
				env: { PATH: "/fake/bin", [NS_CD_DIRECTIVE_FILE]: directivePath },
				git: {
					localBranches: ["master", "feature/a"],
					worktrees: [slotWorktree("slot-01")],
				},
			});
			// Simulate a non-CLI (Capability API) context where the CLI-only flag is false;
			// the explicit side-effect opt-in must still drive the write.
			const slotClient = createSlotClient({
				cwd: "/repo",
				context: { ...run.context, shouldWriteCdDirective: false },
				sideEffects: { shouldCopyClipboard: false, shouldWriteCdDirective: true },
			});

			const result = await slotClient.checkoutBranch({ branchName: "feature/a" });

			expect(result.ok).toBe(true);
			expect(await readFile(directivePath, "utf8")).toBe("/slots/repos/repo/worktrees/slot-01");
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});

	it("maps lifecycle failures to typed Capability API failures", async () => {
		const run = runScenario([], {
			git: { localBranches: ["master"], worktrees: [slotWorktree("slot-01")] },
		});

		const slotClient = createSlotClient({ cwd: "/repo", context: run.context });
		const result = await slotClient.checkoutBranch({ branchName: "feature/missing" });

		expect(result).toEqual({
			ok: false,
			failure: {
				errorType: "branch-missing",
				message: "Branch 'feature/missing' does not exist. Pass -b/--new to create it from HEAD.",
			},
		});
		expect(run.git.operations()).toEqual([]);
	});
});
