import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, describe, expect, test } from "vitest";

import {
	NodeCommandExecApi,
	commandSucceeded,
	type CommandExecApi,
} from "@nseng-ai/foundation/exec";

import { runGsAutobranch, type GsAutobranchCheckpointGateway } from "../../src/core/autobranch.ts";
import {
	RealGsAutobranchGitGateway,
	RealGsAutobranchProviderGateway,
} from "../../src/core/real-autobranch-gateways.ts";

const directories: string[] = [];
const interaction = { isInteractive: () => false, confirm: async () => false };

afterEach(async () => {
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});

describe("official gh-stack v0.1.0 autobranch", () => {
	test("bootstraps dirty trunk and proves the invoking provider view", async (context) => {
		const fixture = await createFixture(context);
		await writeFile(join(fixture.repository, "staged.txt"), "staged\n");
		await run(fixture.commands, fixture.repository, "git", ["add", "staged.txt"]);
		await writeFile(join(fixture.repository, "unstaged.txt"), "unstaged\n");

		const result = await invoke(fixture.commands, fixture.repository, "bootstrap-child");

		expect(result).toMatchObject({
			status: "success",
			data: {
				outcome: "completed",
				path: "trunk-bootstrap",
				source: "main",
				child: "bootstrap-child",
				clean: true,
				relationship: { currentBranch: "bootstrap-child", childCurrentTopmost: true },
			},
		});
	});

	test("extends the invoking worktree's tracked top with mixed pending work", async (context) => {
		const fixture = await createFixture(context);
		await run(fixture.commands, fixture.repository, "gh", ["stack", "init", "feature"]);
		const peer = join(fixture.root, "owner-peer");
		await run(fixture.commands, fixture.repository, "git", [
			"worktree",
			"add",
			"-b",
			"owner-peer",
			peer,
			"main",
		]);
		await writeFile(join(fixture.repository, "tracked.txt"), "base\n");
		await run(fixture.commands, fixture.repository, "git", ["add", "tracked.txt"]);
		await run(fixture.commands, fixture.repository, "git", ["commit", "-m", "feature"]);
		await writeFile(join(fixture.repository, "tracked.txt"), "changed\n");
		await writeFile(join(fixture.repository, "untracked.txt"), "new\n");

		const result = await invoke(fixture.commands, fixture.repository, "extension-child");
		const sharedChild = await fixture.commands.exec("git", ["rev-parse", "extension-child"], {
			cwd: peer,
		});

		expect(commandSucceeded(sharedChild)).toBe(true);
		expect(result).toMatchObject({
			status: "success",
			data: {
				outcome: "completed",
				path: "tracked-top-extension",
				source: "feature",
				child: "extension-child",
				clean: true,
				relationship: {
					currentBranch: "extension-child",
					childDirectlyAboveSource: true,
					childCurrentTopmost: true,
				},
			},
		});
	});

	test("refuses peer-only invoking membership while shared refs remain visible", async (context) => {
		const fixture = await createFixture(context);
		await run(fixture.commands, fixture.repository, "gh", ["stack", "init", "owner-feature"]);
		await run(fixture.commands, fixture.repository, "git", ["switch", "main"]);
		const peer = join(fixture.root, "peer");
		await run(fixture.commands, fixture.repository, "git", [
			"worktree",
			"add",
			peer,
			"owner-feature",
		]);
		await writeFile(join(peer, "peer.txt"), "pending\n");
		const ownerRef = await fixture.commands.exec("git", ["rev-parse", "owner-feature"], {
			cwd: peer,
		});
		expect(commandSucceeded(ownerRef)).toBe(true);

		const result = await invoke(fixture.commands, peer, "must-not-exist");

		expect(result).toMatchObject({
			status: "negative",
			data: {
				outcome: "refused",
				path: "tracked-top-extension",
				source: "owner-feature",
				child: null,
				recovery: { action: "inspect-provider-worktree" },
			},
		});
		const child = await fixture.commands.exec(
			"git",
			["show-ref", "--verify", "--quiet", "refs/heads/must-not-exist"],
			{ cwd: peer },
		);
		expect(child).toMatchObject({ type: "exited", code: 1 });
	});
});

async function createFixture(context: { skip: (message: string) => never }): Promise<{
	root: string;
	repository: string;
	commands: CommandExecApi;
}> {
	const baseCommands = new NodeCommandExecApi();
	const version = await baseCommands.exec("gh", ["stack", "--version"]);
	if (!commandSucceeded(version) || version.stdout.trim() !== "gh stack version 0.1.0") {
		context.skip(
			`requires exact gh stack version 0.1.0; observed ${version.stdout.trim() || version.stderr.trim() || version.type}`,
		);
	}
	const root = await mkdtemp(join(tmpdir(), "gs-autobranch-provider-"));
	directories.push(root);
	const repository = join(root, "repository");
	await run(baseCommands, root, "git", ["init", "-b", "main", repository]);
	await run(baseCommands, repository, "git", ["config", "user.name", "GS smoke"]);
	await run(baseCommands, repository, "git", ["config", "user.email", "gs@example.invalid"]);
	await writeFile(join(repository, "root.txt"), "root\n");
	await run(baseCommands, repository, "git", ["add", "."]);
	await run(baseCommands, repository, "git", ["commit", "-m", "root"]);
	await run(baseCommands, repository, "git", [
		"symbolic-ref",
		"refs/remotes/origin/HEAD",
		"refs/remotes/origin/main",
	]);
	const commands: CommandExecApi = {
		exec: async (command, args, options) =>
			await baseCommands.exec(command, args, {
				...options,
				env: { ...process.env, ...options?.env },
			}),
	};
	return { root, repository, commands };
}

async function invoke(commands: CommandExecApi, cwd: string, child: string) {
	const checkpoint: GsAutobranchCheckpointGateway = {
		commit: async (message) => {
			const added = await commands.exec("git", ["add", "-A"], { cwd });
			if (!commandSucceeded(added)) return { ok: false, message: added.stderr };
			const committed = await commands.exec("git", ["commit", "-m", message], { cwd });
			return commandSucceeded(committed)
				? { ok: true, value: committed.stdout.trim() }
				: { ok: false, message: committed.stderr };
		},
	};
	return await runGsAutobranch(
		{
			git: new RealGsAutobranchGitGateway(commands, cwd),
			provider: new RealGsAutobranchProviderGateway(commands, cwd),
			checkpoint,
			preparation: {
				prepare: async () => ({
					ok: true,
					value: { child, checkpointMessage: `[cp] ${child}` },
				}),
			},
		},
		interaction,
		{ slug: child, yes: true },
	);
}

async function run(
	commands: CommandExecApi,
	cwd: string,
	command: string,
	args: string[],
): Promise<void> {
	const result = await commands.exec(command, args, { cwd });
	if (!commandSucceeded(result))
		throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
}
