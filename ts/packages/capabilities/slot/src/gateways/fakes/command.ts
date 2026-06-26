import type { ExecResult } from "@sdl/core/exec";

import type { SlotCommandGateway, SlotCommandRunOptions } from "../command.ts";

export interface FakeSlotCommandInvocation {
	command: string;
	args: readonly string[];
	cwd: string;
}

export interface FakeSlotExecResult {
	stdout?: string | undefined;
	stderr?: string | undefined;
	code?: number | undefined;
	killed?: boolean | undefined;
}

export interface FakeSlotCommandGatewayOptions {
	/** Scripted results keyed by worktree path (`cwd`). */
	resultsByCwd?: Readonly<Record<string, FakeSlotExecResult>> | undefined;
	/** Default result for any cwd without a scripted entry. */
	defaultResult?: FakeSlotExecResult | undefined;
}

export class FakeSlotCommandGateway implements SlotCommandGateway {
	private readonly resultsByCwd: Readonly<Record<string, FakeSlotExecResult>>;
	private readonly defaultResult: FakeSlotExecResult;
	private readonly log: FakeSlotCommandInvocation[] = [];

	constructor(options: FakeSlotCommandGatewayOptions = {}) {
		this.resultsByCwd = options.resultsByCwd ?? {};
		this.defaultResult = options.defaultResult ?? {};
	}

	async run(
		command: string,
		args: readonly string[],
		options: SlotCommandRunOptions,
	): Promise<ExecResult> {
		this.log.push({ command, args: [...args], cwd: options.cwd });
		const scripted = this.resultsByCwd[options.cwd] ?? this.defaultResult;
		return {
			stdout: scripted.stdout ?? "",
			stderr: scripted.stderr ?? "",
			code: scripted.code ?? 0,
			killed: scripted.killed ?? false,
		};
	}

	invocations(): readonly FakeSlotCommandInvocation[] {
		return [...this.log];
	}
}
