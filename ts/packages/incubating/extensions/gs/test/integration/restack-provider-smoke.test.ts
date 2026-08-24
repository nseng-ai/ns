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

import { runGsRestackResolve } from "../../src/core/restack-command.ts";
import { RealGsRestackGitGateway } from "../../src/core/real-restack-git-gateway.ts";
import { RealGsStackProviderGateway } from "../../src/core/real-stack-provider-gateway.ts";

const tempDirectories: string[] = [];

afterEach(async () => {
	for (const directory of tempDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("official gh-stack v0.1.0 no-remote smoke", () => {
	test("completes a clean local cascade through public commands", async (context) => {
		const commands = new NodeCommandExecApi();
		const version = await commands.exec("gh", ["stack", "--version"]);
		if (!commandSucceeded(version) || version.stdout.trim() !== "gh stack version 0.1.0") {
			context.skip(
				`requires exact gh stack version 0.1.0; observed ${version.stdout.trim() || version.stderr.trim() || version.type}`,
			);
		}

		const cwd = await mkdtemp(join(tmpdir(), "gs-restack-provider-smoke-"));
		tempDirectories.push(cwd);
		await git(commands, cwd, ["init", "-b", "main"]);
		await git(commands, cwd, ["config", "user.name", "GS smoke"]);
		await git(commands, cwd, ["config", "user.email", "gs-smoke@example.invalid"]);
		await writeFile(join(cwd, "root.txt"), "root\n");
		await git(commands, cwd, ["add", "."]);
		await git(commands, cwd, ["commit", "-m", "root"]);
		await gh(commands, cwd, ["stack", "init", "a"]);
		await writeFile(join(cwd, "a.txt"), "a\n");
		await git(commands, cwd, ["add", "."]);
		await git(commands, cwd, ["commit", "-m", "a"]);
		await gh(commands, cwd, ["stack", "add", "b"]);
		await writeFile(join(cwd, "b.txt"), "b\n");
		await git(commands, cwd, ["add", "."]);
		await git(commands, cwd, ["commit", "-m", "b"]);
		await gh(commands, cwd, ["stack", "add", "c"]);
		await writeFile(join(cwd, "c.txt"), "c\n");
		await git(commands, cwd, ["add", "."]);
		await git(commands, cwd, ["commit", "-m", "c"]);
		await git(commands, cwd, ["switch", "a"]);
		await writeFile(join(cwd, "a.txt"), "a\na2\n");
		await git(commands, cwd, ["commit", "-am", "a2"]);
		await git(commands, cwd, ["switch", "b"]);

		const overlayCommands: CommandExecApi = {
			exec: async (command, args, options) =>
				await commands.exec(command, args, {
					...options,
					env: { ...process.env, ...options?.env },
				}),
		};
		const result = await runGsRestackResolve(
			{
				provider: new RealGsStackProviderGateway(overlayCommands, cwd),
				git: new RealGsRestackGitGateway(overlayCommands, cwd),
			},
			{ interactive: false, confirm: async () => false },
			{ downstack: false, dryRun: false, yes: true },
		);

		expect(result).toMatchObject({
			status: "success",
			data: {
				outcome: "completed",
				selectedBranches: ["b", "c"],
				git: { checkoutBranch: "b", clean: true, operation: "none" },
			},
		});
	});
});

async function git(commands: NodeCommandExecApi, cwd: string, args: string[]): Promise<void> {
	await run(commands, cwd, "git", args);
}

async function gh(commands: NodeCommandExecApi, cwd: string, args: string[]): Promise<void> {
	await run(commands, cwd, "gh", args);
}

async function run(
	commands: NodeCommandExecApi,
	cwd: string,
	command: string,
	args: string[],
): Promise<void> {
	const result = await commands.exec(command, args, { cwd });
	if (!commandSucceeded(result)) {
		throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
	}
}
