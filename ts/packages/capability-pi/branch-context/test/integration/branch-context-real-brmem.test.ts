import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { NodeCommandExecApi } from "@sdl/core/exec";
import type { ExecOptions, ExecResult } from "@sdl/core/command";
import { copyExecOptionsWithout } from "@sdl/core/exec/testing";
import { createTempGitRepo } from "@sdl/git/testing";
import { createTempDirTracker } from "@sdl/core/test-kit";
import registerBranchContextExtension from "../../src/extension.ts";
import {
	DEFAULT_PLAN_CONTENT,
	PLAN_KEY,
	PLAN_SLUG,
	createContext,
	execResult,
	type RegisteredCommand,
} from "../branch-context-extension-support.ts";
import type { CustomMessage, ExtensionAPI, ToolDefinition } from "../../src/host-types.ts";

const tempDirs = createTempDirTracker();

afterEach(async () => {
	await tempDirs.cleanup();
});

describe("branch-context extension with real Branch Memory", () => {
	test("from-plan attaches through Branch Memory even when the Pi exec host drops stdin", async () => {
		const repo = createTempGitRepo({
			prefix: "branch-context-real-brmem-repo-",
			userEmail: "branch-context-test@example.com",
			userName: "branch-context Test",
			readmeText: "# Repo\n",
		});
		try {
			const planFile = await createPlanFile();
			const pi = new StdinDroppingPi();
			registerBranchContextExtension(pi);
			const command = pi.commands.get("sdl:branch-context:from-plan");
			if (command === undefined) throw new Error("missing branch-context command");

			await command.handler(planFile, createContext([], { cwd: repo.path }).ctx);

			expect(pi.sentMessages).toHaveLength(1);
			expect(pi.sentMessages[0]?.content).toContain("Created branch context and attached plan.");
			const encodedBranch = PLAN_SLUG.replaceAll("/", "---");
			const show = await pi.delegate.exec(
				"git",
				["show", `refs/brmem/ns/branch-context/${encodedBranch}:${PLAN_KEY}`],
				{ cwd: repo.path },
			);
			expect(show).toMatchObject({ code: 0, stdout: DEFAULT_PLAN_CONTENT });
		} finally {
			repo.cleanup();
		}
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
		return await this.delegate.exec(
			command,
			args,
			copyExecOptionsWithout(options, { shouldDropStdin: true }),
		);
	}

	sendMessage(message: CustomMessage): void {
		this.sentMessages.push(message);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

async function createPlanFile(): Promise<string> {
	const dir = await tempDirs.makeTempDir("branch-context-real-brmem-plan-");
	await mkdir(dir, { recursive: true });
	const planFile = join(dir, `${PLAN_SLUG}.md`);
	await writeFile(planFile, DEFAULT_PLAN_CONTENT, "utf8");
	return planFile;
}
