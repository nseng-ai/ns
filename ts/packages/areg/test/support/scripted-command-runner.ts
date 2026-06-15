import { expect } from "vitest";

import type { CommandRunner, ExecResult } from "@asdl/core/exec";

export interface RunnerCall {
	command: string;
	args: string[];
	cwd?: string | undefined;
}

export interface ScriptStep {
	command: string;
	args: string[];
	stdout?: string | undefined;
	stderr?: string | undefined;
	exitCode?: number | undefined;
	startupError?: string | undefined;
	killed?: boolean | undefined;
}

export class ScriptedCommandRunner {
	readonly calls: RunnerCall[] = [];
	private readonly errors: string[] = [];
	private readonly script: ScriptStep[];

	constructor(script: ScriptStep[]) {
		this.script = [...script];
	}

	readonly runner: CommandRunner = async (command, args, options = {}) => {
		this.calls.push({ command, args: [...args], cwd: options.cwd });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected command: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return result({ exitCode: 99, stderr: message });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return result({ exitCode: 99, stderr: message });
		}
		return result(expected);
	};

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

export function step(command: string, args: string[], stdout = "", exitCode = 0, stderr = ""): ScriptStep {
	return { command, args, stdout, exitCode, stderr };
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function result(fields: Pick<ScriptStep, "stdout" | "stderr" | "exitCode" | "startupError" | "killed">): ExecResult {
	return {
		code: fields.exitCode ?? 0,
		stdout: fields.stdout ?? "",
		stderr: fields.startupError ?? fields.stderr ?? "",
		killed: fields.killed === true,
		...(fields.startupError === undefined ? {} : { startupError: fields.startupError }),
	};
}
