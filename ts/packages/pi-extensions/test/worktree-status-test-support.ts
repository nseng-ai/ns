import { expect } from "vitest";

import { githubWorktreePrStatusQuery } from "@asdl/core/github-status";
import type { ExecResult, StatusTheme } from "@asdl/ccc/worktree-status";
import type { ExtensionContext } from "../src/worktree-status.ts";

export interface ExecCall {
	command: string;
	args: string[];
}

export interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | Promise<Partial<ExecResult>> | undefined;
	onCall?: (() => void) | undefined;
}

export class OrderlessFakePi {
	readonly calls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
		const index = this.script.findIndex(
			(expected) => expected.command === command && sameArgs(expected.args, args),
		);
		if (index === -1) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		const [expected] = this.script.splice(index, 1);
		const result = execResult(await expected?.result);
		expected?.onCall?.();
		return result;
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

export type RegisteredEventName =
	| "input"
	| "user_bash"
	| "agent_start"
	| "agent_end"
	| "turn_start"
	| "turn_end"
	| "message_start"
	| "message_end"
	| "tool_execution_start"
	| "tool_execution_end"
	| "model_select"
	| "thinking_level_select"
	| "session_start"
	| "session_shutdown";

type SessionStartHandler = (event: unknown, ctx: ExtensionContext) => Promise<void> | void;
type SessionShutdownHandler = () => Promise<void> | void;

interface RegisteredCommand {
	description: string;
	handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
}

export class RegistrationFakePi {
	readonly commands: string[] = [];
	readonly events: RegisteredEventName[] = [];
	readonly renderers: string[] = [];

	registerCommand(name: string): void {
		this.commands.push(name);
	}

	on(event: RegisteredEventName): void {
		this.events.push(event);
	}

	async exec(): Promise<ExecResult> {
		return execResult({ code: 99 });
	}

	registerMessageRenderer(customType: string): void {
		this.renderers.push(customType);
	}
}

export class LifecycleFakePi extends OrderlessFakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	sessionStart: SessionStartHandler | undefined;
	sessionShutdown: SessionShutdownHandler | undefined;

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	on(event: RegisteredEventName, handler: unknown): void {
		if (event === "session_start") this.sessionStart = handler as SessionStartHandler;
		if (event === "session_shutdown") this.sessionShutdown = handler as SessionShutdownHandler;
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

export function step(
	command: string,
	args: string[],
	result?: Partial<ExecResult> | Promise<Partial<ExecResult>>,
): ScriptedExec {
	return { command, args, result };
}

export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
	let resolvePromise: ((value: T) => void) | undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve(value) {
			if (resolvePromise === undefined) throw new Error("deferred promise was not initialized");
			resolvePromise(value);
		},
	};
}

export function revListStep(base: string, count: number): ScriptedExec {
	return step("git", ["rev-list", "--count", `${base}..HEAD`], { stdout: `${count}\n` });
}

export function dirtyStep(stdout = ""): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { stdout });
}

export function headOidStep(oid = "abc123"): ScriptedExec {
	return step("git", ["rev-parse", "HEAD"], { stdout: `${oid}\n` });
}

export function remoteOriginStep(url = "git@github.com:dagster-io/asdl-tools.git"): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], { stdout: `${url}\n` });
}

export function basicGitStatusScript(
	base = "main",
	count = 1,
	dirtyStdout = "",
	oid = "abc123",
): ScriptedExec[] {
	return [revListStep(base, count), dirtyStep(dirtyStdout), headOidStep(oid)];
}

export function brmemListStep(
	result: Partial<ExecResult> | Promise<Partial<ExecResult>>,
): ScriptedExec {
	return step("brmem", ["list", "--format", "json"], result);
}

export function ghNoPrSteps(headRefName = "feature/current"): ScriptedExec[] {
	return [
		remoteOriginStep(),
		step(
			"gh",
			[
				"api",
				"graphql",
				"-f",
				`query=${githubWorktreePrStatusQuery}`,
				"-f",
				"owner=dagster-io",
				"-f",
				"repo=asdl-tools",
				"-f",
				`headRefName=${headRefName}`,
			],
			{ stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }) },
		),
	];
}

export async function flushPromises(): Promise<void> {
	for (let index = 0; index < 10; index++) await Promise.resolve();
}

export const TEST_THEME: StatusTheme = {
	fg(color, value) {
		const code = color === "accent" ? "36" : color === "error" ? "31" : "90";
		return `\x1B[${code}m${value}\x1B[39m`;
	},
	underline(value) {
		return `\x1B[4m${value}\x1B[24m`;
	},
};
