import { describe, expect, test } from "vitest";

import { withTempRepoSkill } from "@nseng-ai/foundation/test-kit";

import type { EffectiveSkillInfo } from "../src/kit/skills/expansion.ts";
import type { RawPiExecResult } from "../src/kit/shared/command-exec.ts";
const ROOT = "/repo";
const JUST_TIMEOUT_MS = 10 * 60 * 1000;
const JUST_CI_TIMEOUT_MS = 30 * 60 * 1000;

type NotifyLevel = "info" | "warning" | "error";

interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

interface CommandContext {
	cwd: string;
	hasUI: boolean;
	getSystemPromptOptions(): { skills?: readonly EffectiveSkillInfo[] };
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

interface ExecOptions {
	cwd?: string;
	timeout?: number;
	onStdout?: (text: string) => void;
	onStderr?: (text: string) => void;
}

interface ExecCall {
	command: string;
	args: readonly string[];
	options: ExecOptions | undefined;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface StatusUpdate {
	key: string;
	value: string | undefined;
}

type JustFixExtension = (pi: FakePi, exec?: FakePi["exec"]) => void;

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly sentUserMessages: string[] = [];
	private readonly execResult: RawPiExecResult;

	constructor(execResult: RawPiExecResult) {
		this.execResult = execResult;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(
		command: string,
		args: readonly string[],
		options?: ExecOptions,
	): Promise<RawPiExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		options?.onStdout?.(this.execResult.stdout ?? "");
		options?.onStderr?.(this.execResult.stderr ?? "");
		return this.execResult;
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function execResult(overrides: Partial<RawPiExecResult> = {}): RawPiExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
	};
}

function createContext(
	cwd = ROOT,
	skills: readonly EffectiveSkillInfo[] = [],
): {
	ctx: CommandContext;
	notifications: Notification[];
	statuses: StatusUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const statuses: StatusUpdate[] = [];
	let waits = 0;
	const ctx: CommandContext = {
		cwd,
		hasUI: true,
		getSystemPromptOptions: () => ({ skills }),
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

function effectiveSkillInfo(skillPath: string, baseDir: string): EffectiveSkillInfo {
	return { name: "code-just-fix", filePath: skillPath, baseDir };
}

async function loadJustFixExtension(): Promise<JustFixExtension> {
	const module = (await import(
		new URL("../../../../../../../../.pi/extensions/just-fix.ts", import.meta.url).href
	)) as {
		default: JustFixExtension;
	};
	return module.default;
}

describe("just-fix extension", () => {
	test("runs just and invokes code-just-fix with the expanded skill block on failure", async () => {
		await withTempRepoSkill(
			{
				skillName: "code-just-fix",
				markdown: `---
name: code-just-fix
hidden-frontmatter-token: do-not-include
---

# Internal Code Just Fix

Repair the failed just run.
`,
				prefix: "code-just-fix-skill-",
			},
			async ({ repoDir, skillDir, skillPath }) => {
				const pi = new FakePi(
					execResult({ code: 1, stdout: "unit failed\n", stderr: "lint failed\n" }),
				);
				const justFixExtension = await loadJustFixExtension();
				justFixExtension(pi, pi.exec.bind(pi));
				const command = pi.commands.get("just");
				expect(command).toBeDefined();
				if (!command) {
					throw new Error("just command was not registered");
				}

				const context = createContext(repoDir, [effectiveSkillInfo(skillPath, skillDir)]);
				await command.handler("", context.ctx);

				expect(context.waitForIdleCalls()).toBe(1);
				expect(pi.execCalls).toEqual([
					{
						command: "just",
						args: [],
						options: {
							cwd: repoDir,
							timeout: JUST_TIMEOUT_MS,
						},
					},
				]);
				expect(context.statuses).toEqual([
					{ key: "ns-cli-command", value: "⠋ /just · running" },
					{ key: "ns-cli-command", value: undefined },
				]);
				expect(context.notifications).toEqual([
					{ message: "`just` failed; invoking code-just-fix.", level: "warning" },
				]);

				const prompt = pi.sentUserMessages[0] ?? "";
				expect(prompt).toContain(`<skill name="code-just-fix" location="${skillPath}">`);
				expect(prompt).toContain(`References are relative to ${skillDir}.`);
				expect(prompt).toContain("# Internal Code Just Fix\n\nRepair the failed just run.");
				expect(prompt).not.toContain("hidden-frontmatter-token");
				expect(prompt).toContain(
					`\`just\` has already been run in ${repoDir} and failed (exit code 1).`,
				);
				expect(prompt).toContain("stdout:\nunit failed");
				expect(prompt).toContain("stderr:\nlint failed");
			},
		);
	});

	test("does not run just or send a prompt when the effective skill is missing", async () => {
		const pi = new FakePi(execResult());
		const justFixExtension = await loadJustFixExtension();
		justFixExtension(pi, pi.exec.bind(pi));
		const command = pi.commands.get("just");
		if (!command) throw new Error("just command was not registered");

		const context = createContext();
		await command.handler("", context.ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.waitForIdleCalls()).toBe(1);
		expect(context.notifications).toEqual([
			{
				message: expect.stringContaining(
					'Could not load required skill "code-just-fix": Pi did not include the skill in its effective skill inventory.',
				),
				level: "error",
			},
		]);
	});

	test("deterministic just-ci success does not read or parse the required skill", async () => {
		await withTempRepoSkill(
			{
				skillName: "code-just-fix",
				markdown: "---\nname: code-just-fix\n# Missing fence\n",
				prefix: "passing-code-just-fix-skill-",
			},
			async ({ repoDir, skillDir, skillPath }) => {
				const pi = new FakePi(execResult());
				const justFixExtension = await loadJustFixExtension();
				justFixExtension(pi, pi.exec.bind(pi));
				const command = pi.commands.get("just-ci");
				expect(command?.description).toBe(
					"Run CI excluding Reviews; if it fails, invoke code-just-fix.",
				);
				if (!command) {
					throw new Error("just-ci command was not registered");
				}

				const context = createContext(repoDir, [effectiveSkillInfo(skillPath, skillDir)]);
				await command.handler("", context.ctx);

				expect(context.waitForIdleCalls()).toBe(1);
				expect(pi.execCalls).toEqual([
					{
						command: "just",
						args: ["ci"],
						options: {
							cwd: repoDir,
							timeout: JUST_CI_TIMEOUT_MS,
						},
					},
				]);
				expect(context.statuses).toEqual([
					{ key: "ns-cli-command", value: "⠋ /just-ci · running" },
					{ key: "ns-cli-command", value: undefined },
				]);
				expect(context.notifications).toEqual([{ message: "`just ci` passed.", level: "info" }]);
				expect(pi.sentUserMessages).toEqual([]);
			},
		);
	});
});
