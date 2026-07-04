import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { stripAnsi } from "@ns/clinkr/testing";
import { afterEach, describe, expect, it } from "vitest";

import { SLOT_CD_DIRECTIVE_FILE } from "../../src/core/shell/cd-directive.ts";
import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const directiveRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		directiveRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe("slot goto CLI", () => {
	it("goes to assigned slot by number", async () => {
		const run = runScenario(["goto", "-n", "1", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: "feature/a",
				operation: null,
				cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
			},
		});
	});

	it("renders house-style human navigation output", async () => {
		const run = runScenario(["goto", "-n", "1"], {
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] },
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ slot-01 -> feature/a",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
	});

	it("renders operation state in human navigation output", async () => {
		const path = "/slots/repos/repo/worktrees/slot-01";
		const run = runScenario(["goto", "--wt", "slot-01"], {
			git: {
				worktrees: [{ path, branch: "feature/a" }],
				branchOccupancies: [{ path, branch: "feature/a", operation: "rebase" }],
			},
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")[0]).toBe(
			"✓ slot-01 -> feature/a (rebase in progress)",
		);
	});

	it("renders clipboard failure as non-fatal human navigation guidance", async () => {
		const run = runScenario(["goto", "-n", "1"], {
			clipboardResult: { type: "failure", reason: "backend-missing", detail: "missing pbcopy" },
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] },
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ slot-01 -> feature/a",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Clipboard unavailable (missing pbcopy)",
		]);
	});

	it("goes to assigned slot by worktree name", async () => {
		const run = runScenario(["goto", "--wt", "slot-02", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "a"), slotWorktree("slot-02", "b")],
				localBranches: ["a", "b"],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { slotName: "slot-02", branchName: "b" },
		});
	});

	it("rejects conflicting selectors", async () => {
		const run = runScenario(["goto", "-n", "1", "--wt", "slot-01", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "a")] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "conflicting-slot-args" });
	});

	it("goes to an unassigned slot by number", async () => {
		const run = runScenario(["goto", "-n", "1", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: null,
				operation: null,
				cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
			},
		});
	});

	it("goes to an unassigned slot by worktree name", async () => {
		const run = runScenario(["goto", "--wt", "slot-02", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "a"), slotWorktree("slot-02")] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { slotName: "slot-02", branchName: null },
		});
	});

	it("renders an unassigned slot as available in human navigation output", async () => {
		const run = runScenario(["goto", "-n", "1"], {
			git: { worktrees: [slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ slot-01 (available)",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
	});

	it("returns negative for a slot outside the managed pool", async () => {
		const run = runScenario(["goto", "--wt", "slot-02", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			exitCode: 1,
			message: "slot-02 is not in the managed slot pool. Run `slot list` to see the pool.",
		});
	});

	it("surfaces operation state", async () => {
		const path = "/slots/repos/repo/worktrees/slot-01";
		const run = runScenario(["goto", "--wt", "slot-01", "--format", "json"], {
			git: {
				worktrees: [{ path, branch: "feature/a" }],
				branchOccupancies: [{ path, branch: "feature/a", operation: "rebase" }],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { operation: "rebase" } });
	});

	it("treats clipboard failure as non-fatal and still emits the cd command", async () => {
		const run = runScenario(["goto", "-n", "1", "--format", "json"], {
			clipboardResult: { type: "failure", reason: "backend-missing", detail: "missing pbcopy" },
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
				clipboardCopied: false,
				clipboardSkipped: false,
				clipboardFailureReason: "backend-missing",
				clipboardFailureDetail: "missing pbcopy",
			},
		});
	});

	it("marks clipboard as skipped with --no-clipboard", async () => {
		const run = runScenario(["goto", "-n", "1", "--no-clipboard", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				clipboardCopied: false,
				clipboardSkipped: true,
				clipboardFailureReason: null,
				clipboardFailureDetail: null,
			},
		});
	});

	it("writes the shell cd directive for human output", async () => {
		const directivePath = await makeDirectivePath();
		const run = runScenario(["goto", "-n", "1"], {
			env: { PATH: "/fake/bin", [SLOT_CD_DIRECTIVE_FILE]: directivePath },
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] },
		});
		expect(await run.exit).toBe(0);
		await expect(readFile(directivePath, "utf8")).resolves.toBe(
			"/slots/repos/repo/worktrees/slot-01",
		);
	});

	it.each(["json", "markdown", "md"])(
		"does not write the shell cd directive for %s output",
		async (format) => {
			const directivePath = await makeDirectivePath();
			const run = runScenario(["goto", "-n", "1", "--format", format], {
				env: { PATH: "/fake/bin", [SLOT_CD_DIRECTIVE_FILE]: directivePath },
				git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] },
			});
			expect(await run.exit).toBe(0);
			await expect(readDirectiveFile(directivePath)).resolves.toBeNull();
		},
	);

	it("does not write the shell cd directive for json schema output", async () => {
		const directivePath = await makeDirectivePath();
		const run = runScenario(["goto", "--json-schema"], {
			env: { PATH: "/fake/bin", [SLOT_CD_DIRECTIVE_FILE]: directivePath },
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] },
		});
		expect(await run.exit).toBe(0);
		await expect(readDirectiveFile(directivePath)).resolves.toBeNull();
	});
});

async function makeDirectivePath(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "slot-cd-directive-"));
	directiveRoots.push(root);
	return join(root, "directive");
}

async function readDirectiveFile(path: string): Promise<string | null> {
	if (!existsSync(path)) return null;
	return await readFile(path, "utf8");
}
