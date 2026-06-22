import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { NodeCommandExecApi, type ExecOptions, type ExecResult } from "@sdl/core/exec";
import registerBranchContextExtension from "../../src/branch-context-extension.ts";
import {
	DEFAULT_PLAN_CONTENT,
	PLAN_KEY,
	PLAN_SLUG,
	createContext,
	execResult,
	type RegisteredCommand,
} from "../branch-context-extension-support.ts";
import type {
	CustomMessage,
	ExtensionAPI,
	ToolDefinition,
} from "../../src/branch-context/host-types.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("branch-context extension with real Branch Memory", () => {
	test("from-plan attaches through Branch Memory even when the Pi exec host drops stdin", async () => {
		const repoPath = await createGitRepo();
		const planFile = await createPlanFile();
		const pi = new StdinDroppingPi();
		registerBranchContextExtension(pi);
		const command = pi.commands.get("sdl:branch-context:from-plan");
		if (command === undefined) throw new Error("missing branch-context command");

		await command.handler(planFile, createContext([], { cwd: repoPath }).ctx);

		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created branch context and attached plan.");
		const encodedBranch = PLAN_SLUG.replaceAll("/", "---");
		const show = await pi.delegate.exec(
			"git",
			["show", `refs/brmem/ns/branch-context/${encodedBranch}:${PLAN_KEY}`],
			{ cwd: repoPath },
		);
		expect(show).toMatchObject({ code: 0, stdout: DEFAULT_PLAN_CONTENT });
	});
});

class StdinDroppingPi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly sentMessages: CustomMessage[] = [];
	readonly sentUserMessages: string[] = [];
	readonly delegate = new NodeCommandExecApi();

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		if (command === "pi") return execResult({ stdout: `${PLAN_SLUG}\n` });
		return await this.delegate.exec(command, args, omitStdin(options));
	}

	sendMessage(message: CustomMessage): void {
		this.sentMessages.push(message);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function omitStdin(options: ExecOptions | undefined): ExecOptions | undefined {
	if (options === undefined) return undefined;
	return {
		...(options.cwd === undefined ? {} : { cwd: options.cwd }),
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.timeout === undefined ? {} : { timeout: options.timeout }),
		...(options.timeoutKillGraceMs === undefined
			? {}
			: { timeoutKillGraceMs: options.timeoutKillGraceMs }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
		...(options.onStdout === undefined ? {} : { onStdout: options.onStdout }),
		...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
	};
}

async function createGitRepo(): Promise<string> {
	const repoPath = await createTempDir("branch-context-real-brmem-repo-");
	const commands = new NodeCommandExecApi();
	await runGit(commands, repoPath, ["init", "-b", "main"]);
	await runGit(commands, repoPath, ["config", "user.email", "branch-context-test@example.com"]);
	await runGit(commands, repoPath, ["config", "user.name", "branch-context Test"]);
	await writeFile(join(repoPath, "README.md"), "# Repo\n", "utf8");
	await runGit(commands, repoPath, ["add", "README.md"]);
	await runGit(commands, repoPath, ["commit", "-m", "initial"]);
	return repoPath;
}

async function createPlanFile(): Promise<string> {
	const dir = await createTempDir("branch-context-real-brmem-plan-");
	await mkdir(dir, { recursive: true });
	const planFile = join(dir, `${PLAN_SLUG}.md`);
	await writeFile(planFile, DEFAULT_PLAN_CONTENT, "utf8");
	return planFile;
}

async function createTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function runGit(commands: NodeCommandExecApi, cwd: string, args: string[]): Promise<void> {
	const result = await commands.exec("git", args, { cwd });
	if (result.code !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	}
}
