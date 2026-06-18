import { expect } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import handoffExtension, {
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
} from "../src/handoff.ts";
import type {
	NewSessionOptions,
	RenderComponent,
	SendUserMessageOptions,
	TuiHandle,
} from "../src/handoff/runtime-types.ts";

export const ROOT = "/repo";
export const BRANCH = "feature/handoff";

export type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
export type RegisteredTool = Parameters<NonNullable<ExtensionAPI["registerTool"]>>[0];
export type CommandInfo = NonNullable<ReturnType<NonNullable<ExtensionAPI["getCommands"]>>>[number];
export type CustomMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0];
export type MessageRenderer = Parameters<NonNullable<ExtensionAPI["registerMessageRenderer"]>>[1];

export interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number; signal?: AbortSignal } | undefined;
}

export interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

export interface Notification {
	message: string;
	level: "info" | "warning" | "error" | undefined;
}

export interface Selection {
	title: string;
	items: string[];
}

export interface InputPrompt {
	title: string;
	placeholder: string | undefined;
}

export interface SentUserMessageCall {
	content: string;
	options: SendUserMessageOptions | undefined;
}

export interface NewSessionCall {
	parentSession: string | undefined;
}

export class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, RegisteredTool>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly renderers = new Map<string, MessageRenderer>();
	readonly sentMessages: CustomMessage[] = [];
	readonly sentUserMessages: string[] = [];
	readonly sentUserMessageCalls: SentUserMessageCall[] = [];
	readonly registerMessageRenderer?: (customType: string, renderer: MessageRenderer) => void;
	readonly sendMessage?: (message: CustomMessage) => void;
	readonly registerTool?: (tool: RegisteredTool) => void;
	private readonly script: ScriptedExec[];
	private readonly commandInfos: CommandInfo[];

	constructor(
		script: ScriptedExec[] = [],
		commandInfos: CommandInfo[] = [],
		options: {
			registerMessageRenderer?: boolean;
			sendMessage?: boolean;
			registerTool?: boolean;
		} = {},
	) {
		this.script = [...script];
		this.commandInfos = [...commandInfos];
		if (options.registerMessageRenderer ?? true) {
			this.registerMessageRenderer = (customType: string, renderer: MessageRenderer): void => {
				this.renderers.set(customType, renderer);
			};
		}
		if (options.sendMessage ?? true) {
			this.sendMessage = (message: CustomMessage): void => {
				this.sentMessages.push(message);
			};
		}
		if (options.registerTool ?? true) {
			this.registerTool = (tool: RegisteredTool): void => {
				this.tools.set(tool.name, tool);
			};
		}
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
	): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	getCommands(): CommandInfo[] {
		return this.commandInfos;
	}

	getThinkingLevel(): "medium" {
		return "medium";
	}

	sendUserMessage(content: string, options?: SendUserMessageOptions): void {
		this.sentUserMessages.push(content);
		this.sentUserMessageCalls.push({ content, options });
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

export function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

export function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

export function branchStep(branch = BRANCH): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n` });
}

export function checkStep(branch: string, key: string, exists: boolean): ScriptedExec {
	const payload = { exit_code: 0, data: { key, namespace: "handoff", branch, present: exists } };
	return step(
		"brmem",
		["check", key, "--namespace", "handoff", "--branch", branch, "--format", "json"],
		{
			code: 0,
			stdout: `${JSON.stringify(payload)}\n`,
		},
	);
}

export function cmuxIdentifyStep(): ScriptedExec {
	return step("cmux", ["identify", "--json", "--id-format", "both"], {
		stdout: JSON.stringify({
			caller: { workspace_id: "workspace-1", pane_id: "pane-1", window_id: "window-1" },
		}),
	});
}

export function cmuxCreateSurfaceStep(): ScriptedExec {
	return step(
		"cmux",
		[
			"--json",
			"new-surface",
			"--type",
			"terminal",
			"--workspace",
			"workspace-1",
			"--pane",
			"pane-1",
			"--focus",
			"true",
			"--window",
			"window-1",
		],
		{ stdout: JSON.stringify({ surface_id: "surface-1", workspace_id: "workspace-1" }) },
	);
}

export function getRegisteredCommand(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) {
		throw new Error(`${name} was not registered`);
	}
	return command;
}

export function getRegisteredTool(pi: FakePi, name: string): RegisteredTool {
	const tool = pi.tools.get(name);
	if (tool === undefined) {
		throw new Error(`${name} was not registered`);
	}
	return tool;
}

export function cmuxCreateSurfaceRefStep(): ScriptedExec {
	return step(
		"cmux",
		[
			"--json",
			"new-surface",
			"--type",
			"terminal",
			"--workspace",
			"workspace-1",
			"--pane",
			"pane-1",
			"--focus",
			"true",
			"--window",
			"window-1",
		],
		{
			stdout: JSON.stringify({
				pane_ref: "pane:1",
				surface_ref: "surface:1",
				type: "terminal",
				window_ref: "window:1",
				workspace_ref: "workspace:1",
			}),
		},
	);
}

export function listStep(branch: string, keys: string[]): ScriptedExec {
	return step("handoff", ["list", "--branch", branch, "--format", "json"], {
		stdout: listJson(keys, branch),
	});
}

export function listAllStep(entries: Array<{ key: string; branch: string }>): ScriptedExec {
	return step("handoff", ["list", "--all", "--format", "json"], {
		stdout: listJson(entries, null),
	});
}

export function getStep(branch: string, key: string, artifact: string): ScriptedExec {
	return step("brmem", ["get", key, "--namespace", "handoff", "--branch", branch], {
		stdout: artifact,
	});
}

export function createContext(
	options: {
		hasUI?: boolean;
		mode?: CommandContext["mode"];
		hasCustomUi?: boolean;
		cancelSelect?: boolean;
		selectIndex?: number;
		inputResponse?: string;
		inputUnavailable?: boolean;
		sessionFile?: string;
		cwd?: string;
		isNewSessionCancelled?: boolean;
		newSessionError?: Error;
	} = {},
): {
	ctx: CommandContext;
	notifications: Notification[];
	selections: Selection[];
	inputs: InputPrompt[];
	statuses: Array<string | undefined>;
	tuiEvents: string[];
	newSessionCalls: NewSessionCall[];
	replacementUserMessages: SentUserMessageCall[];
	replacementNotifications: Notification[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const selections: Selection[] = [];
	const inputs: InputPrompt[] = [];
	const statuses: Array<string | undefined> = [];
	const tuiEvents: string[] = [];
	const newSessionCalls: NewSessionCall[] = [];
	const replacementUserMessages: SentUserMessageCall[] = [];
	const replacementNotifications: Notification[] = [];
	let waits = 0;

	const ui: CommandContext["ui"] = {
		notify(message: string, level?: "info" | "warning" | "error"): void {
			notifications.push({ message, level });
		},
		async select(title: string, items: string[]): Promise<string | undefined> {
			selections.push({ title, items: [...items] });
			if (options.cancelSelect) {
				return undefined;
			}
			return items[options.selectIndex ?? 0];
		},
		setStatus(_key: string, value: string | undefined): void {
			statuses.push(value);
		},
	};

	if (!options.inputUnavailable) {
		ui.input = async (title: string, placeholder?: string): Promise<string | undefined> => {
			inputs.push({ title, placeholder });
			return options.inputResponse;
		};
	}

	if (options.hasCustomUi) {
		ui.custom = async <T>(
			factory: (
				tui: TuiHandle,
				theme: unknown,
				keybindings: unknown,
				done: (value: T) => void,
			) => RenderComponent,
		): Promise<T> => {
			let doneCalled = false;
			let doneValue: T | undefined;
			factory(
				{
					stop(): void {
						tuiEvents.push("stop");
					},
					start(): void {
						tuiEvents.push("start");
					},
					requestRender(force?: boolean): void {
						tuiEvents.push(`requestRender(${String(force)})`);
					},
				},
				{},
				{},
				(value: T): void => {
					doneValue = value;
					doneCalled = true;
				},
			);
			if (!doneCalled) {
				throw new Error("custom UI factory did not call done");
			}
			return doneValue as T;
		};
	}

	const ctx: CommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		mode: options.mode ?? "tui",
		ui,
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
		async newSession(sessionOptions?: NewSessionOptions): Promise<{ cancelled: boolean }> {
			newSessionCalls.push({ parentSession: sessionOptions?.parentSession });
			if (options.newSessionError !== undefined) {
				throw options.newSessionError;
			}
			if (options.isNewSessionCancelled) {
				return { cancelled: true };
			}
			await sessionOptions?.withSession?.({
				cwd: options.cwd ?? ROOT,
				hasUI: options.hasUI ?? true,
				mode: options.mode ?? "tui",
				ui: {
					notify(message: string, level?: "info" | "warning" | "error"): void {
						replacementNotifications.push({ message, level });
					},
					setStatus(_key: string, value: string | undefined): void {
						statuses.push(value);
					},
				},
				async sendUserMessage(
					content: string,
					messageOptions?: SendUserMessageOptions,
				): Promise<void> {
					replacementUserMessages.push({ content, options: messageOptions });
				},
			});
			return { cancelled: false };
		},
	};

	if (options.sessionFile !== undefined) {
		ctx.sessionManager = { getSessionFile: () => options.sessionFile };
	}

	return {
		ctx,
		notifications,
		selections,
		inputs,
		statuses,
		tuiEvents,
		newSessionCalls,
		replacementUserMessages,
		replacementNotifications,
		waitForIdleCalls: () => waits,
	};
}

interface RunExtensionCommandOptions {
	register(pi: FakePi): void;
	commandName: string;
	args: string;
	script?: ScriptedExec[];
	contextOptions?: {
		hasUI?: boolean;
		mode?: CommandContext["mode"];
		hasCustomUi?: boolean;
		cancelSelect?: boolean;
		selectIndex?: number;
		inputResponse?: string;
		inputUnavailable?: boolean;
		cwd?: string;
		sessionFile?: string;
		isNewSessionCancelled?: boolean;
		newSessionError?: Error;
	};
	commandInfos?: CommandInfo[];
	piOptions?: { registerMessageRenderer?: boolean; sendMessage?: boolean; registerTool?: boolean };
}

export async function runExtensionCommand(options: RunExtensionCommandOptions): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	inputs: InputPrompt[];
	statuses: Array<string | undefined>;
	tuiEvents: string[];
	newSessionCalls: NewSessionCall[];
	replacementUserMessages: SentUserMessageCall[];
	replacementNotifications: Notification[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(options.script, options.commandInfos, options.piOptions);
	options.register(pi);
	const command = getRegisteredCommand(pi, options.commandName);
	const context = createContext(options.contextOptions);
	await command.handler(options.args, context.ctx);
	return { pi, ...context };
}

export async function runCommand(
	commandName:
		| "handoff:create"
		| "handoff:pickup"
		| "handoff:list"
		| "ccc:handoff-tab"
		| "handoff:self",
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: RunExtensionCommandOptions["contextOptions"] = {},
	commandInfos: CommandInfo[] = [],
	piOptions: {
		registerMessageRenderer?: boolean;
		sendMessage?: boolean;
		registerTool?: boolean;
	} = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	inputs: InputPrompt[];
	statuses: Array<string | undefined>;
	tuiEvents: string[];
	newSessionCalls: NewSessionCall[];
	replacementUserMessages: SentUserMessageCall[];
	replacementNotifications: Notification[];
	waitForIdleCalls: () => number;
}> {
	return runExtensionCommand({
		register: handoffExtension,
		commandName,
		args,
		script,
		contextOptions,
		commandInfos,
		piOptions,
	});
}

export function listJson(
	entries: Array<string | { key: string; branch: string }>,
	branch: string | null = BRANCH,
): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			scope: branch === null ? "all-branches" : "branch",
			branch,
			include_deleted: false,
			handoffs: entries.map((entry) => {
				const key = typeof entry === "string" ? entry : entry.key;
				const entryBranch = typeof entry === "string" ? (branch ?? BRANCH) : entry.branch;
				return {
					branch: entryBranch,
					branch_state: "active",
					slug: key.replace(/\.md$/, ""),
					key,
					entry_locator: `refs/brmem/ns/handoff/${entryBranch}:${key}`,
					updated_at: "2026-06-05T00:00:00Z",
				};
			}),
		},
	});
}

export function brmemListJson(
	entries: Array<string | { key: string; branch: string }>,
	branch: string | null = BRANCH,
): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: "handoff",
			key: null,
			branch,
			all_branches: branch === null,
			entries: entries.map((entry) => {
				if (typeof entry === "string") {
					return { namespace: "handoff", key: entry, branch: branch ?? BRANCH };
				}
				return { namespace: "handoff", key: entry.key, branch: entry.branch };
			}),
		},
	});
}

export async function withTempSkill<T>(
	callback: (skillPath: string, repoDir: string) => Promise<T>,
): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "handoff-create-skill-"));
	const skillDir = join(dir, "skills", "handoff-create");
	await mkdir(skillDir, { recursive: true });
	const skillPath = join(skillDir, "SKILL.md");
	await writeFile(
		skillPath,
		`---\nname: handoff-create\ndescription: Test skill\n---\n\n# handoff-create\n\nCreate a handoff from the skill body.`,
		"utf8",
	);
	try {
		return await callback(skillPath, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

export function skillCommandInfo(skillPath: string): CommandInfo {
	return {
		name: "skill:handoff-create",
		source: "skill",
		sourceInfo: {
			path: skillPath,
			source: "project",
			scope: "project",
			origin: "top-level",
		},
	};
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
