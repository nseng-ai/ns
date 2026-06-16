import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { SLOT_CD_DIRECTIVE_FILE } from "../../src/shell/cd-directive.ts";
import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const directiveRoots: string[] = [];

afterEach(async () => {
	await Promise.all(directiveRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("slot goto CLI", () => {
	it("goes to assigned slot by number", async () => {
		const run = runScenario(["goto", "-n", "1", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { slot_name: "slot-01", branch_name: "feature/a", operation: null, cd_command: "cd /slots/repos/repo/worktrees/slot-01" } });
	});

	it("goes to assigned slot by worktree name", async () => {
		const run = runScenario(["goto", "--wt", "slot-02", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", "a"), slotWorktree("slot-02", "b")], localBranches: ["a", "b"] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { slot_name: "slot-02", branch_name: "b" } });
	});

	it("rejects conflicting selectors", async () => {
		const run = runScenario(["goto", "-n", "1", "--wt", "slot-01", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", "a")] } });
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "conflicting_slot_args" });
	});

	it("returns negative for an unassigned slot", async () => {
		const run = runScenario(["goto", "-n", "1", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01")] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ exit_code: 1, message: "slot-01 is not currently assigned. Run `slot list` to see the pool." });
	});

	it("surfaces operation state", async () => {
		const path = "/slots/repos/repo/worktrees/slot-01";
		const run = runScenario(["goto", "--wt", "slot-01", "--format", "json"], { git: { worktrees: [{ path, branch: "feature/a" }], branchOccupancies: [{ path, branch: "feature/a", operation: "rebase" }] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { operation: "rebase" } });
	});

	it("writes the shell cd directive for human output", async () => {
		const directivePath = await makeDirectivePath();
		const run = runScenario(["goto", "-n", "1"], { env: { PATH: "/fake/bin", [SLOT_CD_DIRECTIVE_FILE]: directivePath }, git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] } });
		expect(await run.exit).toBe(0);
		await expect(readFile(directivePath, "utf8")).resolves.toBe("/slots/repos/repo/worktrees/slot-01");
	});

	it.each(["json", "markdown", "md"])("does not write the shell cd directive for %s output", async (format) => {
		const directivePath = await makeDirectivePath();
		const run = runScenario(["goto", "-n", "1", "--format", format], { env: { PATH: "/fake/bin", [SLOT_CD_DIRECTIVE_FILE]: directivePath }, git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] } });
		expect(await run.exit).toBe(0);
		await expect(readDirectiveFile(directivePath)).resolves.toBeNull();
	});

	it("does not write the shell cd directive for json schema output", async () => {
		const directivePath = await makeDirectivePath();
		const run = runScenario(["goto", "--json-schema"], { env: { PATH: "/fake/bin", [SLOT_CD_DIRECTIVE_FILE]: directivePath }, git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] } });
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
