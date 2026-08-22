import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";

import { RealGhStackLocalInventoryGateway } from "../../src/core/gateways/real.ts";

const cleanupPaths: string[] = [];

afterEach(async () => {
	await Promise.all(
		cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("local gh-stack state filesystem integration", () => {
	test("resolves provider state from the linked worktree common directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-gh-stack-"));
		cleanupPaths.push(root);
		const main = join(root, "main");
		const linked = join(root, "linked");
		const exec = new NodeCommandExecApi();

		await runGit(exec, root, ["init", "-b", "main", main]);
		await runGit(exec, main, ["config", "user.email", "test@example.com"]);
		await runGit(exec, main, ["config", "user.name", "Test User"]);
		await writeFile(join(main, "README.md"), "fixture\n", "utf8");
		await runGit(exec, main, ["add", "README.md"]);
		await runGit(exec, main, ["commit", "-m", "initial"]);
		await runGit(exec, main, ["worktree", "add", "-b", "feature/linked", linked]);

		const git = new RealGitGateway(exec);
		const commonDir = await git.gitCommonDir({ cwd: linked });
		if (!commonDir.ok) throw new Error(commonDir.error.message);
		await writeFile(
			join(commonDir.value, "gh-stack"),
			JSON.stringify({
				schemaVersion: 1,
				stacks: [
					{
						trunk: { branch: "main" },
						branches: [{ branch: "feature/linked" }],
					},
				],
			}),
			"utf8",
		);

		const result = await new RealGhStackLocalInventoryGateway({
			cwd: linked,
			env: process.env,
			exec,
			git,
		}).loadLocalStacks();

		expect(result).toEqual({
			ok: true,
			value: [
				{
					id: null,
					number: null,
					base: "main",
					branches: [{ name: "feature/linked", pullRequest: null }],
				},
			],
		});
	});
});

async function runGit(
	exec: NodeCommandExecApi,
	cwd: string,
	args: readonly string[],
): Promise<void> {
	const result = await exec.exec("git", [...args], { cwd });
	if (result.type !== "exited" || result.code !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	}
}
