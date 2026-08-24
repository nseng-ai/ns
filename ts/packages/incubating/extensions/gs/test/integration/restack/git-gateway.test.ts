import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";

import { RealGsRestackGitGateway } from "../../../src/core/index.ts";

const directories: string[] = [];

afterEach(async () => {
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});

describe("real GS restack Git observations", () => {
	test("observes named, dirty, staged, unmerged, and active rebase state", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "gs-restack-git-"));
		directories.push(cwd);
		const commands = new NodeCommandExecApi();
		await git(commands, cwd, ["init", "-b", "main"]);
		await git(commands, cwd, ["config", "user.email", "test@example.com"]);
		await git(commands, cwd, ["config", "user.name", "Test"]);
		await writeFile(join(cwd, "file.txt"), "base\n");
		await git(commands, cwd, ["add", "file.txt"]);
		await git(commands, cwd, ["commit", "-m", "base"]);
		const gateway = new RealGsRestackGitGateway(commands, cwd);
		expect(await gateway.inspect()).toMatchObject({
			ok: true,
			state: { branch: "main", operation: "none", clean: true, hasStagedChanges: false },
		});

		await writeFile(join(cwd, "staged.txt"), "staged\n");
		await git(commands, cwd, ["add", "staged.txt"]);
		expect(await gateway.inspect()).toMatchObject({
			ok: true,
			state: { clean: false, hasStagedChanges: true },
		});

		await git(commands, cwd, ["commit", "-m", "main"]);
		await git(commands, cwd, ["checkout", "-b", "topic"]);
		await writeFile(join(cwd, "file.txt"), "topic\n");
		await git(commands, cwd, ["commit", "-am", "topic"]);
		await git(commands, cwd, ["checkout", "main"]);
		await writeFile(join(cwd, "file.txt"), "main\n");
		await git(commands, cwd, ["commit", "-am", "conflict"]);
		await gitAllowFailure(commands, cwd, ["rebase", "main", "topic"]);
		expect(await gateway.inspect()).toMatchObject({
			ok: true,
			state: { branch: null, operation: "rebase", clean: false, unmergedPaths: ["file.txt"] },
		});
	});
});

async function git(commands: NodeCommandExecApi, cwd: string, args: string[]): Promise<void> {
	const result = await commands.exec("git", args, { cwd });
	if (result.type !== "exited" || result.code !== 0) throw new Error(result.stderr);
}

async function gitAllowFailure(
	commands: NodeCommandExecApi,
	cwd: string,
	args: string[],
): Promise<void> {
	await commands.exec("git", args, { cwd, env: { GIT_EDITOR: "true" } });
}
