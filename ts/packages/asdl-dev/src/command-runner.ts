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
};

export type CommandRunner = (
	command: string,
	args: readonly string[],
	options?: { cwd?: string },
) => Promise<CommandResult>;

export type CommandResolver = (name: string) => string | undefined;

export type CommandPrefix = {
	command: string;
	args: string[];
};

export async function runCommand(
	command: string,
	args: readonly string[],
	options: { cwd?: string } = {},
): Promise<CommandResult> {
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;

		const spawnOptions: SpawnOptions = {
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		};
		if (options.cwd !== undefined) {
			spawnOptions.cwd = options.cwd;
		}

		const child = spawn(command, [...args], spawnOptions);
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});

		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			resolve({
				command,
				args: [...args],
				exitCode: 127,
				stdout,
				stderr,
				startupError: error instanceof Error ? error.message : String(error),
			});
		});

		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			resolve({
				command,
				args: [...args],
				exitCode: code ?? 1,
				stdout,
				stderr,
			});
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
