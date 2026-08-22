import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, test } from "vitest";

import { RealGitGateway } from "@nseng-ai/foundation/git";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";

import { RealGsLocalInventoryGateway } from "../../src/core/real-local-inventory-gateway.ts";

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

afterEach(async () => {
	for (const directory of tempDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("linked worktree local gh-stack inventory", () => {
	test("uses the actual Git common directory and reads its shared state", async () => {
		const root = await mkdtemp(join(tmpdir(), "gh-stack-linked-worktree-"));
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
		const commonDir = (
			await execFileAsync("git", ["rev-parse", "--git-common-dir"], { cwd: linked })
		).stdout.trim();
		await writeFile(
			join(commonDir, "gh-stack"),
			JSON.stringify({
				schemaVersion: 1,
				stacks: [
					{
						number: 3,
						trunk: { branch: "main" },
						branches: [{ branch: "feature", pullRequest: { number: 7, merged: true } }],
					},
				],
			}),
		);

		const gateway = new RealGsLocalInventoryGateway({
			git: new RealGitGateway(new NodeCommandExecApi()),
		});
		await expect(gateway.readLocalInventory({ cwd: linked })).resolves.toEqual({
			ok: true,
			value: {
				stacks: [
					{
						number: 3,
						base: "main",
						branches: [
							{
								name: "feature",
								pullRequest: { number: 7, recordedMerged: true },
							},
						],
					},
				],
			},
		});
	});
});
