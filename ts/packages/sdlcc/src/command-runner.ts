import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface StackMapCommandOutput {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type StackMapCommandRunner = (command: string, args: readonly string[], options: StackMapCommandOptions) => Promise<StackMapCommandOutput>;

export interface StackMapCommandOptions {
	readonly cwd: string;
	readonly timeoutMs: number;
}

export async function runRealCommand(command: string, args: readonly string[], options: StackMapCommandOptions): Promise<StackMapCommandOutput> {
	try {
		const result = await execFileAsync(command, [...args], {
			cwd: options.cwd,
			timeout: options.timeoutMs,
		});
		return { code: 0, stdout: result.stdout, stderr: result.stderr };
	} catch (error) {
		return commandFailureOutput(error);
	}
}

function commandFailureOutput(error: unknown): StackMapCommandOutput {
	if (!isRecord(error)) return { code: 1, stdout: "", stderr: String(error) };
	return {
		code: typeof error.code === "number" ? error.code : 1,
		stdout: typeof error.stdout === "string" ? error.stdout : "",
		stderr: typeof error.stderr === "string" ? error.stderr : String(error),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
