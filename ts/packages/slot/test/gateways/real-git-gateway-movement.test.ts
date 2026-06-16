import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { RealSlotGitGateway } from "../../src/gateways/git.ts";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RealSlotGitGateway movement methods", () => {
	it("checks branch presence, creates branches, checks out, and detaches in a throwaway repo", async () => {
		const root = await makeRepo();
		const gateway = new RealSlotGitGateway({ cwd: root, env: process.env });
		expect(await gateway.branchExists("master")).toBe(true);
		expect(await gateway.branchExists("feature/a")).toBe(false);
		expect(await gateway.createBranch("feature/a", "HEAD", { shouldForce: false })).toBeNull();
		expect(await gateway.branchExists("feature/a")).toBe(true);
		expect(await gateway.getCurrentBranch(root)).toEqual({ type: "branch", branch: "master" });
		expect(await gateway.checkoutBranch(root, "feature/a")).toBeNull();
		expect(await gateway.getPreviousBranch(root)).toBe("master");
		expect(await gateway.detachHead(root, "master")).toBeNull();
		expect(await gateway.getCurrentBranch(root)).toEqual({ type: "detached" });
	});
});

async function makeRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "slot-real-git-"));
	roots.push(root);
	await git(root, ["init", "-b", "master"]);
	await git(root, ["config", "user.email", "slot-test@example.com"]);
	await git(root, ["config", "user.name", "Slot Test"]);
	await writeFile(join(root, "README.md"), "hello\n", "utf8");
	await git(root, ["add", "README.md"]);
	await git(root, ["commit", "-m", "initial"]);
	return root;
}

async function git(cwd: string, args: readonly string[]): Promise<void> {
	await execFileAsync("git", [...args], { cwd });
}
