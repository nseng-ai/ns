import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { RawPiExecOptions, RawPiExecResult } from "../../../src/pi/host-types.ts";
import { copyExecOptionsWithout } from "@nseng-ai/foundation/exec/testing";
import { createTempGitRepo } from "@nseng-ai/foundation/git/testing";
import { createTempDirTracker } from "@nseng-ai/foundation/test-kit";
import registerBranchContextExtension from "../../../src/pi/extension.ts";
import {
	DEFAULT_PLAN_CONTENT,
	PLAN_KEY,
	PLAN_SLUG,
	createContext,
	execResult,
	type RegisteredCommand,
} from "../../pi/branch-context-extension-support.ts";
import type { CustomMessage, ExtensionAPI, ToolDefinition } from "../../../src/pi/host-types.ts";

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
			await writeFile(
				join(repo.path, "ns.toml"),
				'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
				"utf8",
			);
			const planFile = await createPlanFile();
			const pi = new StdinDroppingPi();
			registerBranchContextExtension(pi);
			const command = pi.commands.get("ns:branch-context:from-plan");
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

	async exec(
		command: string,
		args: string[],
		options?: RawPiExecOptions,
	): Promise<RawPiExecResult> {
		if (command === "pi") return execResult({ stdout: `${PLAN_SLUG}\n` });
		const result = await this.delegate.exec(
			command,
			args,
			copyExecOptionsWithout(options, { shouldDropStdin: true }),
		);
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.type === "exited" ? (result.code ?? 1) : 1,
			killed: result.type === "cancelled" || result.type === "timed-out",
		};
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
