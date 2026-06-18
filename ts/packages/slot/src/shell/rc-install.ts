import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

import { managedRegionBounds } from "@asdl/core/managed-region";

export const SUPPORTED_SHELLS = ["zsh", "bash"] as const;
export type SupportedShell = typeof SUPPORTED_SHELLS[number];

export interface UnsupportedShellFailure {
	type: "unsupported_shell";
	message: string;
}

export interface InstallMarkerBlockOptions {
	rcPath: string;
	beginMarker: string;
	payload: string;
	endMarker: string;
}

export interface InstallMarkerBlockResult {
	rcPath: string;
	isAlreadyInstalled: boolean;
}

export function resolveRequestedShell(raw: string | undefined, env: NodeJS.ProcessEnv): { type: "ok"; shell: SupportedShell } | { type: "failure"; failure: UnsupportedShellFailure } {
	if (raw === undefined) return { type: "ok", shell: detectShell(env) };
	if (isSupportedShell(raw)) return { type: "ok", shell: raw };
	return { type: "failure", failure: unsupportedShellFailure(raw) };
}

export function detectShell(env: NodeJS.ProcessEnv): SupportedShell {
	const shellName = basename(env.SHELL ?? "");
	if (isSupportedShell(shellName)) return shellName;
	return "zsh";
}

export function rcPathForShell(shell: SupportedShell, env: NodeJS.ProcessEnv): string {
	const home = env.HOME ?? homedir();
	return join(home, shell === "zsh" ? ".zshrc" : ".bashrc");
}

export function buildMarkerBlock(options: { beginMarker: string; payload: string; endMarker: string }): string {
	return `\n${options.beginMarker}\n${trimTrailingNewline(options.payload)}\n${options.endMarker}\n`;
}

export async function installMarkerBlock(options: InstallMarkerBlockOptions): Promise<InstallMarkerBlockResult> {
	const existing = existsSync(options.rcPath) ? await readFile(options.rcPath, "utf8") : "";
	const bounds = managedRegionBounds({ text: existing, startMarker: options.beginMarker, endMarker: options.endMarker });
	if (bounds.type !== "missing") return { rcPath: options.rcPath, isAlreadyInstalled: true };
	await mkdir(dirname(options.rcPath), { recursive: true });
	const block = buildMarkerBlock(options);
	const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
	await writeFile(options.rcPath, `${existing}${separator}${block}`, "utf8");
	return { rcPath: options.rcPath, isAlreadyInstalled: false };
}

function isSupportedShell(value: string): value is SupportedShell {
	return SUPPORTED_SHELLS.includes(value as SupportedShell);
}

function unsupportedShellFailure(shell: string): UnsupportedShellFailure {
	return { type: "unsupported_shell", message: `Shell '${shell}' is not supported. Supported shells: zsh, bash.` };
}

function trimTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value.slice(0, -1) : value;
}
