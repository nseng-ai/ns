export type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
};

export type ExecOptions = {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal | undefined;
};

export type ExecFunction = (
	command: string,
	args: string[],
	options?: ExecOptions,
) => Promise<ExecResult>;

export type CommandRunOptions = ExecOptions & {
	acceptedCodes?: number[];
};

const MAX_OUTPUT_CHARS = 4_000;

function trimOutput(output: string): string {
	const trimmed = output.trimEnd();
	if (trimmed.length <= MAX_OUTPUT_CHARS) {
		return trimmed;
	}
	return `[trimmed to last ${MAX_OUTPUT_CHARS} chars]\n${trimmed.slice(trimmed.length - MAX_OUTPUT_CHARS)}`;
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
		return value;
	}
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function formatCommand(command: string, args: string[]): string {
	return [command, ...args].map(shellQuote).join(" ");
}

export class CommandExecutionError extends Error {
	readonly command: string;
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly killed: boolean;

	constructor(command: string, result: ExecResult) {
		const stdout = trimOutput(result.stdout);
		const stderr = trimOutput(result.stderr);
		const status = result.killed ? `exit code ${result.code}; process was killed` : `exit code ${result.code}`;
		const details = [`Command failed (${status}): ${command}`];
		if (stdout.length > 0) {
			details.push(`stdout:\n${stdout}`);
		}
		if (stderr.length > 0) {
			details.push(`stderr:\n${stderr}`);
		}
		super(details.join("\n\n"));
		this.name = "CommandExecutionError";
		this.command = command;
		this.exitCode = result.code;
		this.stdout = stdout;
		this.stderr = stderr;
		this.killed = result.killed;
	}
}

export async function runCommand(
	exec: ExecFunction,
	command: string,
	args: string[],
	options: CommandRunOptions = {},
): Promise<ExecResult> {
	const { acceptedCodes = [0], ...execOptions } = options;
	const result = await exec(command, args, execOptions);
	if (result.killed || !acceptedCodes.includes(result.code)) {
		throw new CommandExecutionError(formatCommand(command, args), result);
	}
	return result;
}
