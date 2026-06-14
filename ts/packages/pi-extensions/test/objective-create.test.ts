import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import objectiveExtension, { type CommandContext, type ExecResult, type ExtensionAPI, type NotifyLevel } from "../src/objective.ts";

const ROOT = "/repo";

const CREATE_SKILL_MARKDOWN = `---
name: objective-create
hidden-frontmatter-token: do-not-include
---

# Test Objective Create Skill

Create one Objective.
`;

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

type CommandInfo = ReturnType<ExtensionAPI["getCommands"]>[number];

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentUserMessages: string[] = [];
	readonly execCalls: Array<{ command: string; args: string[]; options: unknown }> = [];
	private readonly commandInfos: CommandInfo[];

	constructor(commandInfos: CommandInfo[] = []) {
		this.commandInfos = commandInfos;
	}

	on(): { dispose(): void } {
		return { dispose(): void {} };
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: unknown): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		return { stdout: "", stderr: "", code: 0, killed: false };
	}

	getCommands(): readonly CommandInfo[] {
		return this.commandInfos;
	}

	sendMessage(): void {}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function createContext(cwd = ROOT): {
	ctx: CommandContext;
	notifications: Notification[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	let waits = 0;
	const ctx: CommandContext = {
		cwd,
		hasUI: true,
		modelRegistry: {
			find: () => undefined,
		},
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async select(): Promise<string | undefined> {
				return undefined;
			},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};
	return { ctx, notifications, waitForIdleCalls: () => waits };
}

async function withTempRepoSkill<T>(
	skillName: string,
	markdown: string,
	callback: (repoDir: string, skillPath: string, skillDir: string) => Promise<T>,
): Promise<T> {
	const repoDir = await mkdtemp(join(tmpdir(), `${skillName}-repo-`));
	const skillDir = join(repoDir, "skills", skillName);
	const skillPath = join(skillDir, "SKILL.md");
	await mkdir(skillDir, { recursive: true });
	await writeFile(skillPath, markdown, "utf8");
	try {
		return await callback(repoDir, skillPath, skillDir);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
}

async function runObjectiveCreate(args: string, commandInfos: CommandInfo[] = [], cwd: string = ROOT): Promise<{
	pi: FakePi;
	notifications: Notification[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(commandInfos);
	objectiveExtension(pi);
	const command = pi.commands.get("objective:create");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("objective:create was not registered");
	}

	const context = createContext(cwd);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

describe("objective:create command", () => {
	test("registers a typeahead-friendly wrapper for objective-create", () => {
		const pi = new FakePi();

		objectiveExtension(pi);

		const command = pi.commands.get("objective:create");
		expect(command).toBeDefined();
		expect(command?.argumentHint).toBe("[objective-slug-title-or-context]");
		expect(command?.description).toContain("objective-create");
	});

	test("reads objective-create backing skill directly and preserves initial user request", async () => {
		await withTempRepoSkill("objective-create", CREATE_SKILL_MARKDOWN, async (repoDir, skillPath, skillDir) => {
			const result = await runObjectiveCreate("  create slug alpha for typeahead-friendly Objective creation  ", [], repoDir);

			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.execCalls).toEqual([]);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			expect(result.pi.sentUserMessages[0]).toContain(`<skill name="objective-create" location="${skillPath}">`);
			expect(result.pi.sentUserMessages[0]).toContain(`References are relative to ${skillDir}.`);
			expect(result.pi.sentUserMessages[0]).toContain("# Test Objective Create Skill\n\nCreate one Objective.");
			expect(result.pi.sentUserMessages[0]).not.toContain("hidden-frontmatter-token");
			expect(result.pi.sentUserMessages[0]).toContain("Run objective-create with this initial user request:");
			expect(result.pi.sentUserMessages[0]).toContain(
				"```text\ncreate slug alpha for typeahead-friendly Objective creation\n```",
			);
			expect(result.notifications).toContainEqual({
				message: "Invoking objective-create with initial context.",
				level: "info",
			});
		});
	});

	test("empty args still invokes the objective-create interview from backing skill", async () => {
		await withTempRepoSkill("objective-create", CREATE_SKILL_MARKDOWN, async (repoDir, skillPath) => {
			const result = await runObjectiveCreate("", [], repoDir);

			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			expect(result.pi.sentUserMessages[0]).toContain(`<skill name="objective-create" location="${skillPath}">`);
			expect(result.pi.sentUserMessages[0]).toContain(
				"No initial Objective creation request was provided. Start the objective-create interview",
			);
			expect(result.notifications).toContainEqual({
				message: "Invoking objective-create.",
				level: "info",
			});
		});
	});

	test("missing objective-create backing skill notifies an error and sends no prompt", async () => {
		const repoDir = await mkdtemp(join(tmpdir(), "objective-create-missing-repo-"));
		try {
			const result = await runObjectiveCreate("create alpha", [], repoDir);

			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages).toEqual([]);
			expect(result.notifications).toHaveLength(1);
			expect(result.notifications[0]?.level).toBe("error");
			expect(result.notifications[0]?.message).toContain("Failed to read objective-create backing skill");
			expect(result.notifications[0]?.message).toContain("Could not find skills/objective-create/SKILL.md");
			expect(result.notifications[0]?.message).toContain(repoDir);
		} finally {
			await rm(repoDir, { recursive: true, force: true });
		}
	});

	test("objective-create initial request fence grows beyond embedded backticks", async () => {
		await withTempRepoSkill("objective-create", CREATE_SKILL_MARKDOWN, async (repoDir) => {
			const result = await runObjectiveCreate("make `code` and ```nested``` safe", [], repoDir);

			expect(result.pi.sentUserMessages[0]).toContain("````text\nmake `code` and ```nested``` safe\n````");
		});
	});
});
