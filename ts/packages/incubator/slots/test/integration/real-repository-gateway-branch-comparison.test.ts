import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { RealSlotRepositoryGateway } from "../../src/core/gateways/repository.ts";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RealSlotRepositoryGateway branch comparisons", () => {
	it("reads child commit and diff evidence from a real Git repository", async () => {
		const root = await makeRepo();
		await git(root, ["checkout", "-b", "feature/child"]);
		await writeFile(join(root, "child.txt"), "first\nsecond\n", "utf8");
		await git(root, ["add", "child.txt"]);
		await git(root, ["commit", "-m", "add child evidence"]);
		const gateway = new RealSlotRepositoryGateway({ cwd: root, env: process.env });

		const result = await gateway.readBranchComparison({
			parent: "master",
			branch: "feature/child",
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.comparison.commits).toEqual([
			{ sha: expect.stringMatching(/^[0-9a-f]+$/), subject: "add child evidence" },
		]);
		expect(result.comparison.diff).toEqual({
			filesChanged: 1,
			insertions: 2,
			deletions: 0,
			files: [{ path: "child.txt", additions: 2, deletions: 0, binary: false }],
		});
	});
});

async function makeRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "slot-branch-comparison-"));
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
