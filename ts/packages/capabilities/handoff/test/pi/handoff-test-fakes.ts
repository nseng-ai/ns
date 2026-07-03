import { encodeBranchName } from "@ji/brmem";
import { ScriptedQueue, withTempRepoSkill, type TempRepoSkill } from "@ji/core/test-kit";
import handoffExtension, {
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
} from "../../src/pi/extension.ts";
import type {
	NewSessionOptions,
	RenderComponent,
	SendUserMessageOptions,
	ThinkingLevel,
	TuiHandle,
} from "../../src/pi/runtime-types.ts";

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
	readonly renderers = new Map<string, MessageRenderer>();
	readonly sentMessages: CustomMessage[] = [];
	readonly ackMessages: CustomMessage[] = [];
	readonly progressMessages: CustomMessage[] = [];
	readonly sentUserMessages: string[] = [];
	readonly sentUserMessageCalls: SentUserMessageCall[] = [];
	readonly registerMessageRenderer?: (customType: string, renderer: MessageRenderer) => void;
	readonly sendMessage?: (message: CustomMessage) => void;
	readonly registerTool?: (tool: RegisteredTool) => void;
	private readonly script: ScriptedQueue<ScriptedExec>;
	private readonly commandInfos: CommandInfo[];
	private thinkingLevel: ThinkingLevel = "medium";

	constructor(
		script: ScriptedExec[] = [],
		commandInfos: CommandInfo[] = [],
		options: {
			registerMessageRenderer?: boolean;
			sendMessage?: boolean;
			registerTool?: boolean;
		} = {},
	) {
		this.script = new ScriptedQueue(script, (step) => step);
		this.commandInfos = [...commandInfos];
		if (options.registerMessageRenderer ?? true) {
			this.registerMessageRenderer = (customType: string, renderer: MessageRenderer): void => {
				if (customType === "ji-command-ack") return;
				this.renderers.set(customType, renderer);
			};
		}
		if (options.sendMessage ?? true) {
			this.sendMessage = (message: CustomMessage): void => {
				if (message.customType === "ji-command-ack") {
					this.ackMessages.push(message);
					return;
				}
				if (message.customType === "ji-command-progress") {
					this.progressMessages.push(message);
					return;
				}
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
		const missingStepMessage = `unexpected exec: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	getCommands(): CommandInfo[] {
		return this.commandInfos;
	}

	getThinkingLevel(): ThinkingLevel {
		return this.thinkingLevel;
	}

	setThinkingLevel(level: ThinkingLevel): void {
		this.thinkingLevel = level;
	}

	sendUserMessage(content: string, options?: SendUserMessageOptions): void {
		this.sentUserMessages.push(content);
		this.sentUserMessageCalls.push({ content, options });
	}

	assertDone(): void {
		this.script.assertDone();
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

export function branchPresenceStep(branch = BRANCH, exists = true): ScriptedExec {
	return step("git", ["rev-parse", "--verify", `refs/heads/${branch}`], {
		code: exists ? 0 : 1,
		stdout: exists ? `refs/heads/${branch}\n` : "",
		stderr: exists ? "" : "fatal: Needed a single revision\n",
	});
}

export function checkStep(branch: string, key: string, exists: boolean): ScriptedExec[] {
	const snapshotRef = handoffSnapshotRef(branch);
	return [
		branchRefFormatStep(branch),
		step("git", ["cat-file", "-e", `${snapshotRef}:${key}`], { code: exists ? 0 : 1 }),
		...(exists
			? [
					step("git", ["rev-parse", `${snapshotRef}:${key}`], { stdout: "blob-sha\n" }),
					step("git", ["cat-file", "-s", `${snapshotRef}:${key}`], { stdout: "42\n" }),
					step("git", ["log", "-1", "--format=%H%x09%cI", snapshotRef], {
						stdout: "commit-sha\t2026-06-05T00:00:00Z\n",
					}),
				]
			: []),
	];
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

export function listStep(branch: string, keys: string[]): ScriptedExec[] {
	return listEntriesSteps(keys.map((key) => ({ key, branch })));
}

export function listAllStep(entries: Array<{ key: string; branch: string }>): ScriptedExec[] {
	return listEntriesSteps(entries);
}

export function getStep(branch: string, key: string, artifact: string): ScriptedExec[] {
	return [
		branchRefFormatStep(branch),
		step("git", ["show", `${handoffSnapshotRef(branch)}:${key}`], { stdout: artifact }),
	];
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
		| "sdl:handoff:create"
		| "sdl:handoff:pickup"
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

function branchRefFormatStep(branch: string): ScriptedExec {
	return step("git", ["check-ref-format", "--branch", branch], { stdout: `${branch}\n` });
}

function handoffSnapshotRef(branch: string): string {
	const encoded = encodeBranchName(branch);
	if (encoded.type === "error") throw new Error(encoded.error.message);
	return `refs/brmem/ns/handoff/${encoded.value}`;
}

function listEntriesSteps(entries: Array<{ key: string; branch: string }>): ScriptedExec[] {
	const refs = [...new Set(entries.map((entry) => handoffSnapshotRef(entry.branch)))];
	return [
		step("git", ["for-each-ref", "--format=%(refname)", "refs/brmem/base/", "refs/brmem/ns/"], {
			stdout: refs.map((ref) => `${ref}\n`).join(""),
		}),
		...refs.flatMap((ref) => {
			const refEntries = entries.filter((entry) => handoffSnapshotRef(entry.branch) === ref);
			return [
				step("git", ["ls-tree", "-r", "--full-tree", "--format=%(path)%x09%(objectname)", ref], {
					stdout: refEntries.map((entry) => `${entry.key}\tblob-sha\n`).join(""),
				}),
				step("git", ["log", "--format=%cI", "--name-status", ref], {
					stdout: refEntries.map((entry) => `2026-06-05T00:00:00Z\nA\t${entry.key}\n`).join("\n"),
				}),
			];
		}),
	];
}

export const HANDOFF_CREATE_SKILL_MARKDOWN = `---\nname: handoff-create\ndescription: Test skill\n---\n\n# handoff-create\n\nCreate a handoff from the skill body.`;

export function withHandoffCreateSkill<T>(
	callback: (skill: TempRepoSkill) => Promise<T>,
): Promise<T> {
	return withTempRepoSkill(
		{
			skillName: "handoff-create",
			markdown: HANDOFF_CREATE_SKILL_MARKDOWN,
			prefix: "handoff-create-skill-",
		},
		callback,
	);
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
