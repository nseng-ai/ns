import { describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SkillCommandInfo } from "../src/skill-expansion.ts";

const ROOT = "/repo";
const JUST_TIMEOUT_MS = 10 * 60 * 1000;

type NotifyLevel = "info" | "warning" | "error";

interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
}

interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface StatusUpdate {
	key: string;
	value: string | undefined;
}

type JustFixExtension = (pi: FakePi) => void;

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly sentUserMessages: string[] = [];
	private readonly commandInfos: SkillCommandInfo[];
	private readonly execResult: ExecResult;

	constructor(execResult: ExecResult, commandInfos: SkillCommandInfo[] = []) {
		this.execResult = execResult;
		this.commandInfos = commandInfos;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		return this.execResult;
	}

	getCommands(): SkillCommandInfo[] {
		return this.commandInfos;
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function createContext(): {
	ctx: CommandContext;
	notifications: Notification[];
	statuses: StatusUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const statuses: StatusUpdate[] = [];
	let waits = 0;
	const ctx: CommandContext = {
		cwd: ROOT,
		hasUI: true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			setStatus(key: string, value: string | undefined): void {
				statuses.push({ key, value });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, statuses, waitForIdleCalls: () => waits };
}

function skillCommandInfo(skillPath: string, baseDir: string): SkillCommandInfo {
	return {
		name: "skill:code-just-fix",
		source: "skill",
		sourceInfo: { path: skillPath, baseDir },
	};
}

async function loadJustFixExtension(): Promise<JustFixExtension> {
	const module = (await import(new URL("../../../../.pi/extensions/just-fix.ts", import.meta.url).href)) as {
		default: JustFixExtension;
	};
	return module.default;
}

describe("just-fix extension", () => {
	test("runs just and invokes code-just-fix with the expanded skill block on failure", async () => {
		const dir = await mkdtemp(join(tmpdir(), "code-just-fix-skill-"));
		const skillPath = join(dir, "SKILL.md");
		await writeFile(
			skillPath,
			`---
name: code-just-fix
hidden-frontmatter-token: do-not-include
---

# Internal Code Just Fix

Repair the failed just run.
`,
			"utf8",
		);

		try {
			const pi = new FakePi(execResult({ code: 1, stdout: "unit failed\n", stderr: "lint failed\n" }), [
				skillCommandInfo(skillPath, dir),
			]);
			const justFixExtension = await loadJustFixExtension();
			justFixExtension(pi);
			const command = pi.commands.get("just");
			expect(command).toBeDefined();
			if (!command) {
				throw new Error("just command was not registered");
			}

			const context = createContext();
			await command.handler("", context.ctx);

			expect(context.waitForIdleCalls()).toBe(1);
			expect(pi.execCalls).toEqual([{ command: "just", args: [], options: { cwd: ROOT, timeout: JUST_TIMEOUT_MS } }]);
			expect(context.statuses).toEqual([
				{ key: "just", value: "running just…" },
				{ key: "just", value: undefined },
			]);
			expect(context.notifications).toContainEqual({ message: "Running `just`…", level: "info" });
			expect(context.notifications).toContainEqual({
				message: "`just` failed; invoking code-just-fix.",
				level: "warning",
			});

			const prompt = pi.sentUserMessages[0] ?? "";
			expect(prompt).toContain(`<skill name="code-just-fix" location="${skillPath}">`);
			expect(prompt).toContain(`References are relative to ${dir}.`);
			expect(prompt).toContain("# Internal Code Just Fix\n\nRepair the failed just run.");
			expect(prompt).not.toContain("hidden-frontmatter-token");
			expect(prompt).toContain("`just` has already been run in /repo and failed (exit code 1).");
			expect(prompt).toContain("stdout:\nunit failed");
			expect(prompt).toContain("stderr:\nlint failed");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
