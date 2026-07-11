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
	/** Default result for any cwd without a scripted entry. */
	defaultResult?: FakeSlotExecResult;
}

export class FakeSlotCommandGateway implements SlotCommandGateway {
	private readonly resultsByCwd: Readonly<Record<string, FakeSlotExecResult>>;
	private readonly defaultResult: FakeSlotExecResult;
	private readonly log: FakeSlotCommandInvocation[] = [];

	constructor(options: FakeSlotCommandGatewayOptions = {}) {
		this.resultsByCwd = options.resultsByCwd ?? {};
		this.defaultResult = options.defaultResult ?? {
			type: "exited",
			stdout: "",
			stderr: "",
			code: 0,
			signal: null,
		};
	}

	async run(
		command: string,
		args: readonly string[],
		options: SlotCommandRunOptions,
	): Promise<ExecResult> {
		this.log.push({ command, args: [...args], cwd: options.cwd });
		const scripted = this.resultsByCwd[options.cwd] ?? this.defaultResult;
		return scripted;
	}

	invocations(): readonly FakeSlotCommandInvocation[] {
		return [...this.log];
	}
}
