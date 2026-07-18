import type { ExecResult } from "@nseng-ai/foundation/command";

import type { SlotCommandGateway, SlotCommandRunOptions } from "../command.ts";

export interface FakeSlotCommandInvocation {
	command: string;
	args: readonly string[];
	cwd: string;
}

export type FakeSlotExecResult = ExecResult;

export interface FakeSlotCommandGatewayOptions {
	/** Scripted results keyed by worktree path (`cwd`). */
	resultsByCwd?: Readonly<Record<string, FakeSlotExecResult>>;
	/** Scripted pending results keyed by worktree path (`cwd`). */
	pendingResultsByCwd?: Readonly<Record<string, Promise<FakeSlotExecResult>>>;
	/** Default result for any cwd without a scripted entry. */
	defaultResult?: FakeSlotExecResult;
	/** Observer invoked after the invocation is recorded and before its result resolves. */
	onRun?: (invocation: FakeSlotCommandInvocation) => void;
}

export class FakeSlotCommandGateway implements SlotCommandGateway {
	private readonly resultsByCwd: Readonly<Record<string, FakeSlotExecResult>>;
	private readonly pendingResultsByCwd: Readonly<Record<string, Promise<FakeSlotExecResult>>>;
	private readonly defaultResult: FakeSlotExecResult;
	private readonly onRun: ((invocation: FakeSlotCommandInvocation) => void) | undefined;
	private readonly log: FakeSlotCommandInvocation[] = [];

	constructor(options: FakeSlotCommandGatewayOptions = {}) {
		this.resultsByCwd = options.resultsByCwd ?? {};
		this.pendingResultsByCwd = options.pendingResultsByCwd ?? {};
		this.defaultResult = options.defaultResult ?? {
			type: "exited",
			stdout: "",
			stderr: "",
			code: 0,
			signal: null,
		};
		this.onRun = options.onRun;
	}

	async run(
		command: string,
		args: readonly string[],
		options: SlotCommandRunOptions,
	): Promise<ExecResult> {
		const invocation = { command, args: [...args], cwd: options.cwd };
		this.log.push(invocation);
		this.onRun?.(invocation);
		const pending = this.pendingResultsByCwd[options.cwd];
		if (pending !== undefined) return await pending;
		return this.resultsByCwd[options.cwd] ?? this.defaultResult;
	}

	invocations(): readonly FakeSlotCommandInvocation[] {
		return [...this.log];
	}
}
