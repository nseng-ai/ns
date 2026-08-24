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

import {
	RealGsRestackGitGateway,
	RealGsRestackGateway,
	runGsRestackResolve,
} from "../../../src/core/index.ts";

const directories: string[] = [];

afterEach(async () => {
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});

describe("official gh-stack v0.1.0 no-remote smoke", () => {
	test("completes a clean local gh-stack cascade", async (context) => {
		const commands = new NodeCommandExecApi();
		const version = await commands.exec("gh", ["stack", "--version"]);
		if (!commandSucceeded(version) || version.stdout.trim() !== "gh stack version 0.1.0") {
			context.skip(
				`requires exact gh stack version 0.1.0; observed ${version.stdout.trim() || version.stderr.trim() || version.type}`,
			);
		}
		const cwd = await mkdtemp(join(tmpdir(), "gs-restack-gateway-smoke-"));
		directories.push(cwd);
		await run(commands, cwd, "git", ["init", "-b", "main"]);
		await run(commands, cwd, "git", ["config", "user.name", "GS smoke"]);
		await run(commands, cwd, "git", ["config", "user.email", "gs@example.invalid"]);
		await writeFile(join(cwd, "root.txt"), "root\n");
		await run(commands, cwd, "git", ["add", "."]);
		await run(commands, cwd, "git", ["commit", "-m", "root"]);
		await run(commands, cwd, "gh", ["stack", "init", "a"]);
		await writeFile(join(cwd, "a.txt"), "a\n");
		await run(commands, cwd, "git", ["add", "."]);
		await run(commands, cwd, "git", ["commit", "-m", "a"]);
		await run(commands, cwd, "gh", ["stack", "add", "b"]);
		await writeFile(join(cwd, "b.txt"), "b\n");
		await run(commands, cwd, "git", ["add", "."]);
		await run(commands, cwd, "git", ["commit", "-m", "b"]);
		await run(commands, cwd, "git", ["switch", "a"]);
		await writeFile(join(cwd, "a.txt"), "a\na2\n");
		await run(commands, cwd, "git", ["commit", "-am", "a2"]);
		await run(commands, cwd, "git", ["switch", "b"]);

		const overlayCommands: CommandExecApi = {
			exec: async (command, args, options) =>
				await commands.exec(command, args, {
					...options,
					env: { ...process.env, ...options?.env },
				}),
		};
		const result = await runGsRestackResolve(
			{
				restack: new RealGsRestackGateway(overlayCommands, cwd),
				git: new RealGsRestackGitGateway(overlayCommands, cwd),
			},
			{ isInteractive: () => false, confirm: async () => false },
			{ full: false, yes: true },
		);
		expect(result).toMatchObject({ status: "success", data: { outcome: "completed" } });
	});
});

async function run(
	commands: CommandExecApi,
	cwd: string,
	command: string,
	args: string[],
): Promise<void> {
	const result = await commands.exec(command, args, { cwd });
	if (!commandSucceeded(result)) {
		throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
	}
}
