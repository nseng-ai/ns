import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SUPPORTED_SHELLS = ["zsh", "bash"] as const;
export type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

export type ShellResolutionResult =
	| { type: "success"; shell: SupportedShell }
	| { type: "failure"; errorType: "unsupported_shell"; message: string };

export interface RcFilesystem {
	readText(path: string): Promise<{ type: "missing" } | { type: "text"; text: string }>;
	writeText(path: string, text: string): Promise<void>;
	mkdirp(path: string): Promise<void>;
}

export interface RcInstallResult {
	rcPath: string;
	alreadyInstalled: boolean;
}

export class RealRcFilesystem implements RcFilesystem {
	async readText(path: string): Promise<{ type: "missing" } | { type: "text"; text: string }> {
		try {
			return { type: "text", text: await readFile(path, "utf8") };
		} catch (error) {
			if (hasNodeErrorCode(error, "ENOENT")) return { type: "missing" };
			throw error;
		}
	}

	async writeText(path: string, text: string): Promise<void> {
		await writeFile(path, text, "utf8");
	}

	async mkdirp(path: string): Promise<void> {
		await mkdir(path, { recursive: true });
	}
}

export function detectShell(env: NodeJS.ProcessEnv): SupportedShell {
	const raw = env.SHELL ?? "";
	const name = raw.split("/").at(-1) ?? "";
	return isSupportedShell(name) ? name : "zsh";
}

export function resolveShell(explicitShell: string | undefined, env: NodeJS.ProcessEnv): ShellResolutionResult {
	const shell = explicitShell ?? detectShell(env);
	if (isSupportedShell(shell)) return { type: "success", shell };
	return { type: "failure", errorType: "unsupported_shell", message: `Shell '${shell}' is not supported. Supported shells: ${SUPPORTED_SHELLS.join(", ")}.` };
}

export function homeFromEnv(env: NodeJS.ProcessEnv): string {
	return env.HOME ?? process.env.HOME ?? "";
}

export function rcPathForShell(shell: SupportedShell, home: string): string {
	return shell === "zsh" ? join(home, ".zshrc") : join(home, ".bashrc");
}

export function buildMarkerBlock(beginMarker: string, body: string, endMarker: string): string {
	return `\n${beginMarker}\n${body}\n${endMarker}\n`;
}

export function planRcInstall(existingText: string, beginMarker: string, markerBlock: string): { alreadyInstalled: true; nextText: string } | { alreadyInstalled: false; nextText: string } {
	if (existingText.includes(beginMarker)) return { alreadyInstalled: true, nextText: existingText };
	const separator = existingText !== "" && !existingText.endsWith("\n") ? "\n" : "";
	return { alreadyInstalled: false, nextText: `${existingText}${separator}${markerBlock}` };
}

export async function installRcBlock(options: { shell: SupportedShell; home: string; beginMarker: string; markerBlock: string; filesystem?: RcFilesystem | undefined }): Promise<RcInstallResult> {
	const filesystem = options.filesystem ?? new RealRcFilesystem();
	const rcPath = rcPathForShell(options.shell, options.home);
	const readResult = await filesystem.readText(rcPath);
	const existingText = readResult.type === "missing" ? "" : readResult.text;
	const plan = planRcInstall(existingText, options.beginMarker, options.markerBlock);
	if (plan.alreadyInstalled) return { rcPath, alreadyInstalled: true };
	await filesystem.mkdirp(dirname(rcPath));
	await filesystem.writeText(rcPath, plan.nextText);
	return { rcPath, alreadyInstalled: false };
}

function isSupportedShell(value: string): value is SupportedShell {
	return SUPPORTED_SHELLS.some((shell) => shell === value);
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
