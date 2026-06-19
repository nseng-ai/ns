import { expect } from "vitest";

import { githubWorktreePrStatusQuery } from "@asdl/core/github-status";
import type {
	ExecResult,
	GtStatus,
	LocalWorktreeStatus,
	StatusTheme,
	WorktreeGhStatus,
	WorktreeStatusIdentity,
} from "@asdl/ccc/worktree-status";
import type { ExtensionContext, WorktreeStatusLoaders } from "../src/worktree-status.ts";

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
type RegisteredEventHandler = (event: unknown, ctx: ExtensionContext) => Promise<void> | void;

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
	readonly eventHandlers = new Map<RegisteredEventName, RegisteredEventHandler[]>();
	sessionStart: SessionStartHandler | undefined;
	sessionShutdown: SessionShutdownHandler | undefined;

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	on(event: RegisteredEventName, handler: RegisteredEventHandler): void {
		if (event === "session_start") this.sessionStart = handler as SessionStartHandler;
		if (event === "session_shutdown") this.sessionShutdown = handler as SessionShutdownHandler;
		const handlers = this.eventHandlers.get(event) ?? [];
		this.eventHandlers.set(event, [...handlers, handler]);
	}

	async emit(event: RegisteredEventName, payload: unknown, ctx: ExtensionContext): Promise<void> {
		for (const handler of this.eventHandlers.get(event) ?? []) await handler(payload, ctx);
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

export function testContext(statuses?: Map<string, string | undefined>): ExtensionContext {
	return {
		cwd: "/repo",
		hasUI: true,
		ui: {
			theme: TEST_THEME,
			setStatus(key, value) {
				statuses?.set(key, value);
			},
			setWidget() {},
		},
	};
}

const DEFAULT_CWD = "/repo";
const DEFAULT_HEAD_OID = "abc123";

export interface QueuedLoaderResult<T> {
	readonly value: T | Promise<T>;
	onCall?: (() => void) | undefined;
}

export interface FakeWorktreeStatusLoaders extends WorktreeStatusLoaders {
	readonly identityCalls: Array<{ cwd: string }>;
	readonly localCalls: Array<{ cwd: string; identity: WorktreeStatusIdentity | undefined }>;
	readonly ghCalls: Array<{ cwd: string; identity: WorktreeStatusIdentity | undefined }>;
}

export interface FakeWorktreeStatusLoaderOptions {
	identities?: readonly QueuedLoaderResult<WorktreeStatusIdentity>[] | undefined;
	localStatuses?: readonly QueuedLoaderResult<LocalWorktreeStatus>[] | undefined;
	ghStatuses?: readonly QueuedLoaderResult<WorktreeGhStatus>[] | undefined;
	identityCurrent?: readonly boolean[] | boolean | undefined;
	footerBranch?: string | null | undefined;
}

export function worktreeIdentity(
	overrides: Partial<WorktreeStatusIdentity> = {},
): WorktreeStatusIdentity {
	return {
		cwd: overrides.cwd ?? DEFAULT_CWD,
		head: overrides.head ?? { type: "branch", name: "feature/current" },
		...(overrides.headOid === undefined
			? { headOid: DEFAULT_HEAD_OID }
			: { headOid: overrides.headOid }),
	};
}

export function gtStatus(overrides: Partial<GtStatus> = {}): GtStatus {
	return {
		down: Object.hasOwn(overrides, "down") ? overrides.down : "main",
		up: overrides.up ?? "-",
		commits: overrides.commits ?? { type: "count", count: 1 },
		dirty: overrides.dirty ?? "no",
	};
}

export function localStatus(overrides: Partial<LocalWorktreeStatus> = {}): LocalWorktreeStatus {
	const status: LocalWorktreeStatus = {
		identity: overrides.identity ?? worktreeIdentity(),
		brmem: overrides.brmem,
		gt: overrides.gt ?? gtStatus(),
	};
	if (overrides.gtMetadataDiagnostic !== undefined)
		status.gtMetadataDiagnostic = overrides.gtMetadataDiagnostic;
	return status;
}

export function queued<T>(
	value: T | Promise<T>,
	onCall?: (() => void) | undefined,
): QueuedLoaderResult<T> {
	return onCall === undefined ? { value } : { value, onCall };
}

export function fakeWorktreeStatusLoaders(
	options: FakeWorktreeStatusLoaderOptions = {},
): FakeWorktreeStatusLoaders {
	const identityQueue = [...(options.identities ?? [])];
	const localQueue = [...(options.localStatuses ?? [])];
	const ghQueue = [...(options.ghStatuses ?? [])];
	const identityCurrentQueue = Array.isArray(options.identityCurrent)
		? [...options.identityCurrent]
		: undefined;
	const identityCalls: Array<{ cwd: string }> = [];
	const localCalls: Array<{ cwd: string; identity: WorktreeStatusIdentity | undefined }> = [];
	const ghCalls: Array<{ cwd: string; identity: WorktreeStatusIdentity | undefined }> = [];
	const loaders: FakeWorktreeStatusLoaders = {
		identityCalls,
		localCalls,
		ghCalls,
		async loadIdentity(_pi, cwd) {
			identityCalls.push({ cwd });
			const next = identityQueue.shift();
			next?.onCall?.();
			return next === undefined ? worktreeIdentity({ cwd }) : next.value;
		},
		async loadLocalStatus(_pi, cwd, loadOptions) {
			localCalls.push({ cwd, identity: loadOptions?.identity });
			const next = localQueue.shift();
			next?.onCall?.();
			if (next !== undefined) return next.value;
			return localStatus({ identity: loadOptions?.identity ?? worktreeIdentity({ cwd }) });
		},
		async loadGhStatus(_pi, cwd, loadOptions) {
			ghCalls.push({ cwd, identity: loadOptions?.identity });
			const next = ghQueue.shift();
			next?.onCall?.();
			return next === undefined ? { type: "no-pr" } : next.value;
		},
		isIdentityCurrent() {
			if (identityCurrentQueue !== undefined) return identityCurrentQueue.shift() ?? true;
			return options.identityCurrent ?? true;
		},
		readFooterBranch() {
			return options.footerBranch ?? "feature/current";
		},
	};
	return loaders;
}
