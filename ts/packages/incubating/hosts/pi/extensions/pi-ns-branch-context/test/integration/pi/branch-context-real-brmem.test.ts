import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { RawPiExecOptions, RawPiExecResult } from "../../../src/host-types.ts";
import { copyExecOptionsWithout } from "@nseng-ai/foundation/exec/testing";
import { createTempGitRepo } from "@nseng-ai/foundation/git/testing";
import { createTempDirTracker } from "@nseng-ai/foundation/test-kit";
import { buildRepoPlanStoreKey, encodeBranchForPlanPath } from "@nseng-ai/plans/api";
import registerBranchContextExtension from "../../../src/extension.ts";
import {
	DEFAULT_PLAN_CONTENT,
	PLAN_KEY,
	PLAN_SLUG,
	createContext,
	execResult,
	type RegisteredCommand,
} from "../../branch-context-extension-support.ts";
import type { CustomMessage, ExtensionAPI } from "../../../src/host-types.ts";

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
			const planStoreRoot = await tempDirs.makeTempDir("branch-context-real-brmem-plans-");
			const planFile = await createPlanFile(repo.path, planStoreRoot);
			const pi = new StdinDroppingPi();
			registerBranchContextExtension(pi, { planStoreRoot });
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
	readonly sentMessages: CustomMessage[] = [];
	readonly sentUserMessages: string[] = [];
	readonly delegate = new NodeCommandExecApi();
	private readonly activeTools: string[] = [];

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	getActiveTools(): string[] {
		return [...this.activeTools];
	}

	setActiveTools(names: string[]): void {
		this.activeTools.splice(0, this.activeTools.length, ...names);
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

async function createPlanFile(repoPath: string, planStoreRoot: string): Promise<string> {
	const repoRoot = await realpath(repoPath);
	const repoKey = buildRepoPlanStoreKey(repoRoot, repoRoot);
	const dir = join(planStoreRoot, repoKey, encodeBranchForPlanPath("main"));
	await mkdir(dir, { recursive: true });
	const planFile = join(dir, `${PLAN_SLUG}--26-01-02T03-04-05--1.md`);
	await writeFile(planFile, DEFAULT_PLAN_CONTENT, "utf8");
	return planFile;
}
