import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, test } from "vitest";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";

import { RealGsLocalInventoryGateway } from "../../src/core/real-local-inventory-gateway.ts";

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

afterEach(async () => {
	for (const directory of tempDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("linked worktree local gh-stack inventory", () => {
	test("reads only the invoking worktree provider state and reports its canonical Git directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "gs-linked-worktree-"));
		tempDirectories.push(root);
		const repository = join(root, "repository");
		const linked = join(root, "linked");
		await mkdir(repository);
		await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: repository });
		await execFileAsync("git", ["config", "user.email", "test@example.test"], { cwd: repository });
		await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repository });
		await writeFile(join(repository, "README.md"), "fixture\n");
		await execFileAsync("git", ["add", "README.md"], { cwd: repository });
		await execFileAsync("git", ["commit", "-q", "-m", "fixture"], { cwd: repository });
		await execFileAsync("git", ["worktree", "add", "-q", "-b", "feature", linked], {
			cwd: repository,
		});

		const primaryStatePath = await gitPath(repository, "gh-stack");
		const linkedStatePath = await gitPath(linked, "gh-stack");
		expect(dirname(primaryStatePath)).not.toBe(dirname(linkedStatePath));
		await writeState(primaryStatePath, 2, "main");
		await writeState(linkedStatePath, 3, "feature");

		const gateway = new RealGsLocalInventoryGateway({
			git: new RealGitGateway(new NodeCommandExecApi()),
		});
		await expect(gateway.readLocalInventory({ cwd: linked })).resolves.toEqual({
			ok: true,
			value: {
				providerWorktreeGitDir: dirname(linkedStatePath),
				stacks: [
					{
						number: 3,
						base: "main",
						branches: [{ name: "feature", pullRequest: null }],
					},
				],
			},
		});
		await expect(gateway.readLocalInventory({ cwd: repository })).resolves.toEqual({
			ok: true,
			value: {
				providerWorktreeGitDir: dirname(primaryStatePath),
				stacks: [
					{
						number: 2,
						base: "main",
						branches: [{ name: "main", pullRequest: null }],
					},
				],
			},
		});
	});

	test("does not fall back to another worktree when current-worktree provider state is missing", async () => {
		const root = await mkdtemp(join(tmpdir(), "gs-linked-worktree-missing-"));
		tempDirectories.push(root);
		const repository = join(root, "repository");
		const linked = join(root, "linked");
		await mkdir(repository);
		await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: repository });
		await execFileAsync("git", ["config", "user.email", "test@example.test"], { cwd: repository });
		await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repository });
		await writeFile(join(repository, "README.md"), "fixture\n");
		await execFileAsync("git", ["add", "README.md"], { cwd: repository });
		await execFileAsync("git", ["commit", "-q", "-m", "fixture"], { cwd: repository });
		await execFileAsync("git", ["worktree", "add", "-q", "-b", "feature", linked], {
			cwd: repository,
		});
		await writeState(await gitPath(repository, "gh-stack"), 2, "feature");
		const linkedStatePath = await gitPath(linked, "gh-stack");

		const gateway = new RealGsLocalInventoryGateway({
			git: new RealGitGateway(new NodeCommandExecApi()),
		});
		await expect(gateway.readLocalInventory({ cwd: linked })).resolves.toEqual({
			ok: true,
			value: { providerWorktreeGitDir: dirname(linkedStatePath), stacks: [] },
		});
	});
});

async function gitPath(cwd: string, relativePath: string): Promise<string> {
	return (
		await execFileAsync(
			"git",
			["rev-parse", "--path-format=absolute", "--git-path", relativePath],
			{ cwd },
		)
	).stdout.trim();
}

async function writeState(path: string, number: number, branch: string): Promise<void> {
	await writeFile(
		path,
		JSON.stringify({
			schemaVersion: 1,
			stacks: [{ number, trunk: { branch: "main" }, branches: [{ branch }] }],
		}),
	);
}
