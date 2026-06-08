import { expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import handoffExtension, { type CommandContext, type ExecResult, type ExtensionAPI } from "../src/handoff.ts";

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

export class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, RegisteredTool>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly renderers = new Map<string, MessageRenderer>();
	readonly sentMessages: CustomMessage[] = [];
	readonly sentUserMessages: string[] = [];
	readonly registerMessageRenderer?: (customType: string, renderer: MessageRenderer) => void;
	readonly sendMessage?: (message: CustomMessage) => void;
	private readonly script: ScriptedExec[];
	private readonly commandInfos: CommandInfo[];

	constructor(
		script: ScriptedExec[] = [],
		commandInfos: CommandInfo[] = [],
		options: { registerMessageRenderer?: boolean; sendMessage?: boolean } = {},
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
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(tool: RegisteredTool): void {
		this.tools.set(tool.name, tool);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }): Promise<ExecResult> {
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

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
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
	return step("brmem", ["check", key, "--namespace", "handoff", "--branch", branch], { code: exists ? 0 : 1 });
}

export function cmuxIdentifyStep(): ScriptedExec {
	return step("cmux", ["identify", "--json", "--id-format", "both"], {
		stdout: JSON.stringify({ caller: { workspace_id: "workspace-1", pane_id: "pane-1", window_id: "window-1" } }),
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
	return step("brmem", ["get", key, "--namespace", "handoff", "--branch", branch], { stdout: artifact });
}

export function createContext(
	options: {
		hasUI?: boolean;
		cancelSelect?: boolean;
		selectIndex?: number;
		inputResponse?: string;
		inputUnavailable?: boolean;
	} = {},
): {
	ctx: CommandContext;
	notifications: Notification[];
	selections: Selection[];
	inputs: InputPrompt[];
	statuses: Array<string | undefined>;
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const selections: Selection[] = [];
	const inputs: InputPrompt[] = [];
	const statuses: Array<string | undefined> = [];
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

	const ctx: CommandContext = {
		cwd: ROOT,
		hasUI: options.hasUI ?? true,
		ui,
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, selections, inputs, statuses, waitForIdleCalls: () => waits };
}

export async function runCommand(
	commandName: "handoff:create" | "handoff:pickup" | "handoff:list" | "handoff-tab",
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: {
		hasUI?: boolean;
		cancelSelect?: boolean;
		selectIndex?: number;
		inputResponse?: string;
		inputUnavailable?: boolean;
	} = {},
	commandInfos: CommandInfo[] = [],
	piOptions: { registerMessageRenderer?: boolean; sendMessage?: boolean } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	inputs: InputPrompt[];
	statuses: Array<string | undefined>;
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script, commandInfos, piOptions);
	handoffExtension(pi);
	const command = pi.commands.get(commandName);
	expect(command).toBeDefined();
	if (command === undefined) {
		throw new Error(`${commandName} was not registered`);
	}
	const context = createContext(contextOptions);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

export function listJson(entries: Array<string | { key: string; branch: string }>, branch: string | null = BRANCH): string {
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

export function brmemListJson(entries: Array<string | { key: string; branch: string }>, branch: string | null = BRANCH): string {
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

export async function withTempSkill<T>(callback: (skillPath: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "handoff-create-skill-"));
	const skillPath = join(dir, "SKILL.md");
	await writeFile(
		skillPath,
		`---\nname: handoff-create\ndescription: Test skill\n---\n\n# handoff-create\n\nCreate a handoff from the skill body.`,
		"utf8",
	);
	try {
		return await callback(skillPath);
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
