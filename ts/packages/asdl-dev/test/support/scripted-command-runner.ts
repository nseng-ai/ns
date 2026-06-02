import { expect } from "bun:test";

import type { CommandResult, CommandRunner } from "../../src/command-runner.ts";

export interface RunnerCall {
	command: string;
	args: string[];
	cwd?: string | undefined;
}

export interface ResultFields {
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	startupError?: string;
	killed?: boolean;
}

export interface ScriptStep extends ResultFields {
	command: string;
	args: string[];
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
			return result(command, args, { exitCode: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return result(command, args, { exitCode: 99, stderr: message });
		}

		return result(command, args, expected);
	};

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

export function step(command: string, args: string[], stdout = "", exitCode = 0, stderr = ""): ScriptStep {
	return { command, args, stdout, exitCode, stderr };
}

export function startupErrorStep(command: string, args: string[], startupError: string): ScriptStep {
	return { command, args, exitCode: 127, startupError };
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function result(command: string, args: readonly string[], fields: ResultFields): CommandResult {
	const commandResult: CommandResult = {
		command,
		args: [...args],
		exitCode: fields.exitCode ?? 0,
		stdout: fields.stdout ?? "",
		stderr: fields.stderr ?? "",
	};
	if (fields.startupError !== undefined) {
		commandResult.startupError = fields.startupError;
	}
	if (fields.killed === true) {
		commandResult.killed = true;
	}
	return commandResult;
}
