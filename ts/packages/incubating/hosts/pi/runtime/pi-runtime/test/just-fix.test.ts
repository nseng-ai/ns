import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { withTempRepoSkill } from "@nseng-ai/foundation/test-kit";

import type { SkillCommandInfo } from "../src/kit/skills/expansion.ts";
import type { RawPiExecResult } from "../src/kit/shared/command-exec.ts";
import type { SetWidgetFunction } from "../src/runtime/tool-types.ts";
import { ComponentWidgetFake } from "./support/widget-fakes.ts";

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
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		setWidget?: SetWidgetFunction;
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

interface WidgetUpdate {
	key: string;
	value: string[] | undefined;
	options: { placement?: "aboveEditor" | "belowEditor" } | undefined;
}

interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
}

type JustFixExtension = (pi: FakePi, exec?: FakePi["exec"]) => void;

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly messages: CustomMessage[] = [];
	readonly renderers = new Map<string, unknown>();
	readonly sentUserMessages: string[] = [];
	private readonly commandInfos: SkillCommandInfo[];
	private readonly execResult: RawPiExecResult;

	constructor(execResult: RawPiExecResult, commandInfos: SkillCommandInfo[] = []) {
		this.execResult = execResult;
		this.commandInfos = commandInfos;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.renderers.set(customType, renderer);
	}

	sendMessage(message: CustomMessage): void {
		this.messages.push(message);
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

	getCommands(): SkillCommandInfo[] {
		return this.commandInfos;
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

function createContext(cwd = ROOT): {
	ctx: CommandContext;
	notifications: Notification[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const statuses: StatusUpdate[] = [];
	const widgets: WidgetUpdate[] = [];
	const widgetFake = new ComponentWidgetFake({
		onSnapshot: (snapshot) => {
			widgets.push({
				key: snapshot.key,
				value: snapshot.lines,
				options: snapshot.placement === undefined ? undefined : { placement: snapshot.placement },
			});
		},
	});
	let waits = 0;
	const ctx: CommandContext = {
		cwd,
		hasUI: true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			setStatus(key: string, value: string | undefined): void {
				statuses.push({ key, value });
			},
			setWidget: widgetFake.setWidget,
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, statuses, widgets, waitForIdleCalls: () => waits };
}

function skillCommandInfo(skillPath: string, baseDir: string): SkillCommandInfo {
	return {
		name: "skill:code-just-fix",
		source: "skill",
		sourceInfo: { path: skillPath, baseDir },
	};
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
				skillRoot: join(".agents", "skills"),
			},
			async ({ repoDir, skillDir, skillPath }) => {
				const pi = new FakePi(
					execResult({ code: 1, stdout: "unit failed\n", stderr: "lint failed\n" }),
					[skillCommandInfo(skillPath, skillDir)],
				);
				const justFixExtension = await loadJustFixExtension();
				justFixExtension(pi, pi.exec.bind(pi));
				const command = pi.commands.get("just");
				expect(command).toBeDefined();
				if (!command) {
					throw new Error("just command was not registered");
				}

				const context = createContext(repoDir);
				await command.handler("", context.ctx);

				expect(context.waitForIdleCalls()).toBe(1);
				expect(pi.execCalls).toEqual([
					{
						command: "just",
						args: [],
						options: {
							cwd: repoDir,
							timeout: JUST_TIMEOUT_MS,
							onStdout: expect.any(Function),
							onStderr: expect.any(Function),
						},
					},
				]);
				expect(context.statuses).toEqual([{ key: "ns-cli-command", value: undefined }]);
				expect(
					context.widgets.some((update) => update.value?.includes("stdout: unit failed")),
				).toBe(true);
				expect(
					context.widgets.some((update) => update.value?.includes("stderr: lint failed")),
				).toBe(true);
				expect(context.widgets.at(-1)).toEqual({
					key: "ns-cli-command-output",
					value: undefined,
					options: undefined,
				});
				expect(pi.messages).toEqual([
					{
						customType: "ns-command-progress",
						content: "→ Running `just`…",
						display: true,
					},
				]);
				expect(pi.renderers.has("ns-command-ack")).toBe(false);
				expect(pi.renderers.has("ns-command-progress")).toBe(true);
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

	test("runs the CI recipe excluding docs-site and Reviews through just-ci", async () => {
		const pi = new FakePi(execResult());
		const justFixExtension = await loadJustFixExtension();
		justFixExtension(pi, pi.exec.bind(pi));
		const command = pi.commands.get("just-ci");
		expect(command?.description).toBe(
			"Run CI excluding docs-site and Reviews; if it fails, invoke code-just-fix.",
		);
		if (!command) {
			throw new Error("just-ci command was not registered");
		}

		const context = createContext();
		await command.handler("", context.ctx);

		expect(context.waitForIdleCalls()).toBe(1);
		expect(pi.execCalls).toEqual([
			{
				command: "just",
				args: ["ci"],
				options: {
					cwd: ROOT,
					timeout: JUST_CI_TIMEOUT_MS,
					onStdout: expect.any(Function),
					onStderr: expect.any(Function),
				},
			},
		]);
		expect(context.statuses).toEqual([{ key: "ns-cli-command", value: undefined }]);
		expect(context.widgets.at(-1)?.value).toBeUndefined();
		expect(pi.messages).toEqual([
			{
				customType: "ns-command-progress",
				content: "→ Running `just ci`…",
				display: true,
			},
		]);
		expect(context.notifications).toEqual([{ message: "`just ci` passed.", level: "info" }]);
		expect(pi.sentUserMessages).toEqual([]);
	});
});
