import { spawn, type SpawnOptions } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import process from "node:process";

export type CommandResult = {
	command: string;
	args: string[];
	exitCode: number;
	stdout: string;
	stderr: string;
	startupError?: string;
	killed?: boolean;
};

export type CommandRunner = (
	command: string,
	args: readonly string[],
	options?: { cwd?: string; timeoutMs?: number },
) => Promise<CommandResult>;

export type CommandResolver = (name: string) => string | undefined;

export type CommandPrefix = {
	command: string;
	args: string[];
};

export async function runCommand(
	command: string,
	args: readonly string[],
	options: { cwd?: string; timeoutMs?: number } = {},
): Promise<CommandResult> {
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		let killed = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const spawnOptions: SpawnOptions = {
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		};
		if (options.cwd !== undefined) {
			spawnOptions.cwd = options.cwd;
		}

		const finish = (result: Omit<CommandResult, "command" | "args" | "stdout" | "stderr">): void => {
			if (settled) return;
			settled = true;
			if (timeout !== undefined) {
				clearTimeout(timeout);
			}
			resolve({
				command,
				args: [...args],
				stdout,
				stderr,
				...result,
				...(killed ? { killed: true } : {}),
			});
		};

		const child = spawn(command, [...args], spawnOptions);
		if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
			timeout = setTimeout(() => {
				killed = true;
				child.kill("SIGTERM");
			}, options.timeoutMs);
		}
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});

		child.on("error", (error) => {
			finish({
				exitCode: 127,
				startupError: error instanceof Error ? error.message : String(error),
			});
		});

		child.on("close", (code) => {
			finish({ exitCode: code ?? 1 });
		});
	});
}

export function resolveVercelCommandPrefix(resolveCommand: CommandResolver): CommandPrefix | undefined {
	const vercel = resolveCommand("vercel");
	if (vercel !== undefined) {
		return { command: vercel, args: [] };
	}

	const bunx = resolveCommand("bunx");
	if (bunx !== undefined) {
		return { command: bunx, args: ["vercel@latest"] };
	}

	return undefined;
}

export function defaultCommandResolver(name: string): string | undefined {
	if (name.includes("/")) {
		return executablePath(name);
	}

	const pathValue = process.env.PATH ?? "";
	for (const directory of pathValue.split(delimiter)) {
		if (directory === "") continue;
		const candidate = join(directory, name);
		const resolved = executablePath(candidate);
		if (resolved !== undefined) {
			return resolved;
		}
	}

	return undefined;
}

function executablePath(path: string): string | undefined {
	try {
		accessSync(path, constants.X_OK);
		return path;
	} catch {
		return undefined;
	}
}
