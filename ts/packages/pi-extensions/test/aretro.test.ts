import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import aretroExtension, { type CommandContext, type ExtensionAPI, type NotifyLevel } from "../src/aretro.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type CommandInfo = ReturnType<ExtensionAPI["getCommands"]>[number];

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentUserMessages: string[] = [];
	private readonly commandInfos: readonly CommandInfo[];

	constructor(commandInfos: readonly CommandInfo[] = []) {
		this.commandInfos = commandInfos;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	getCommands(): readonly CommandInfo[] {
		return this.commandInfos;
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function createContext(): { ctx: CommandContext; notifications: Notification[]; waitForIdleCalls: () => number } {
	const notifications: Notification[] = [];
	let waits = 0;

	return {
		ctx: {
			hasUI: true,
			ui: {
				notify(message: string, level?: NotifyLevel): void {
					notifications.push({ message, level });
				},
			},
			async waitForIdle(): Promise<void> {
				waits += 1;
			},
		},
		notifications,
		waitForIdleCalls: () => waits,
	};
}

function skillCommandInfo(skillPath: string, baseDir: string): CommandInfo {
	return {
		name: "skill:branch-retro",
		source: "skill",
		sourceInfo: {
			path: skillPath,
			baseDir,
		},
	};
}

async function withTempSkill<T>(markdown: string, callback: (skillPath: string, skillDir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "branch-retro-"));
	const skillPath = join(dir, "SKILL.md");
	await writeFile(skillPath, markdown, "utf8");
	try {
		return await callback(skillPath, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("aretroExtension", () => {
	test("registers /aretro:branch-retro", () => {
		const pi = new FakePi();

		aretroExtension(pi);

		const command = pi.commands.get("aretro:branch-retro");
		expect(command).toBeDefined();
		expect(command?.description).toContain("branch-retro skill");
	});

	test("expands branch-retro skill and forwards command arguments as the user request", async () => {
		await withTempSkill(
			`---
name: branch-retro
description: hidden
---

# Branch Retro

Use aretro evidence.
`,
			async (skillPath, skillDir) => {
				const pi = new FakePi([skillCommandInfo(skillPath, skillDir)]);
				aretroExtension(pi);
				const command = pi.commands.get("aretro:branch-retro");
				expect(command).toBeDefined();
				if (!command) {
					throw new Error("aretro:branch-retro was not registered");
				}

				const { ctx, notifications, waitForIdleCalls } = createContext();
				await command.handler("--max-sessions 5", ctx);

				expect(waitForIdleCalls()).toBe(1);
				expect(notifications).toEqual([
					{
						message: "Invoking /aretro:branch-retro via branch-retro.",
						level: "info",
					},
				]);
				expect(pi.sentUserMessages).toHaveLength(1);
				const prompt = pi.sentUserMessages[0];
				expect(prompt).toContain(`<skill name="branch-retro" location="${skillPath}">`);
				expect(prompt).toContain("# Branch Retro\n\nUse aretro evidence.");
				expect(prompt).not.toContain("description: hidden");
				expect(prompt).toContain("User: --max-sessions 5");
			},
		);
	});

	test("uses fallback prompt when branch-retro skill is unavailable", async () => {
		const pi = new FakePi();
		aretroExtension(pi);
		const command = pi.commands.get("aretro:branch-retro");
		expect(command).toBeDefined();
		if (!command) {
			throw new Error("aretro:branch-retro was not registered");
		}

		const { ctx, notifications } = createContext();
		await command.handler("", ctx);

		expect(notifications).toEqual([
			{
				message: "branch-retro skill was not found; using fallback prompt.",
				level: "warning",
			},
		]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("aretro exec collect-evidence --format json");
		expect(pi.sentUserMessages[0]).toContain("User: Run a branch/session retrospective for the current repository and branch.");
	});
});
