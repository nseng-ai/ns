import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { NodeCommandExecApi, commandSucceeded } from "@nseng-ai/foundation/exec";

import { RealGsRestackGitGateway } from "../../src/core/real-restack-git-gateway.ts";

const tempDirectories: string[] = [];

afterEach(async () => {
	for (const directory of tempDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("real GS restack Git gateway", () => {
	test("observes checkout, cleanliness, refs, ancestry, staged changes, and linked occupancy", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "gs-restack-git-"));
		tempDirectories.push(cwd);
		const commands = new NodeCommandExecApi();
		await git(commands, cwd, ["init", "-b", "main"]);
		await git(commands, cwd, ["config", "user.name", "GS test"]);
		await git(commands, cwd, ["config", "user.email", "gs@example.invalid"]);
		await writeFile(join(cwd, "root.txt"), "root\n");
		await git(commands, cwd, ["add", "root.txt"]);
		await git(commands, cwd, ["commit", "-m", "root"]);
		await git(commands, cwd, ["switch", "-c", "child"]);
		await writeFile(join(cwd, "child.txt"), "child\n");
		await git(commands, cwd, ["add", "child.txt"]);

		const gateway = new RealGsRestackGitGateway(commands, cwd);
		await expect(gateway.readState()).resolves.toMatchObject({
			ok: true,
			value: {
				checkout: { branch: "child" },
				operation: "none",
				clean: false,
				hasStagedChanges: true,
				unmergedPaths: [],
			},
		});
		await expect(gateway.readBranchRefs(["main", "child"])).resolves.toMatchObject({
			ok: true,
			value: [{ name: "main" }, { name: "child" }],
		});
		await expect(gateway.isAncestor("main", "child")).resolves.toEqual({ ok: true, value: true });
		await expect(gateway.readWorktreeOccupancy()).resolves.toEqual({ ok: true, value: [] });
	});
});

async function git(commands: NodeCommandExecApi, cwd: string, args: string[]): Promise<void> {
	const result = await commands.exec("git", args, { cwd });
	if (!commandSucceeded(result)) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}
