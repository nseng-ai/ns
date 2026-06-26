import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { z } from "zod";

import { managedRegionBounds } from "./managed-region.ts";

const SUPPORTED_SHELLS = ["zsh", "bash"] as const;
type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

export const markerSurfaceShowRequestSchema = z.object({
	shell: z
		.string()
		.optional()
		.describe("Shell to render output for (zsh or bash). Defaults from $SHELL, then zsh."),
});

export const markerSurfaceInstallRequestSchema = markerSurfaceShowRequestSchema;

export const markerSurfaceShowResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	script: z.string(),
});

export const markerSurfaceInstallResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	rc_path: z.string(),
	is_already_installed: z.boolean(),
});

export type MarkerSurfaceShowRequest = z.infer<typeof markerSurfaceShowRequestSchema>;
export type MarkerSurfaceInstallRequest = z.infer<typeof markerSurfaceInstallRequestSchema>;
export type MarkerSurfaceShowResult = z.infer<typeof markerSurfaceShowResultSchema>;
export type MarkerSurfaceInstallResult = z.infer<typeof markerSurfaceInstallResultSchema>;

export interface CommandCdWrapperScriptOptions {
	readonly commandName: string;
}

export function renderCommandCdWrapperScript(options: CommandCdWrapperScriptOptions): string {
	const localPrefix = `_${options.commandName}`;
	const directiveEnvVar = `${options.commandName.toUpperCase()}_CD_DIRECTIVE_FILE`;
	return `${options.commandName}() {
  local ${localPrefix}_cd_directive_file
  local ${localPrefix}_status
  local ${localPrefix}_destination

  ${localPrefix}_cd_directive_file="$(mktemp "\${TMPDIR:-/tmp}/${options.commandName}-cd.XXXXXX")" || return 1
  ${directiveEnvVar}="$${localPrefix}_cd_directive_file" command ${options.commandName} "$@"
  ${localPrefix}_status=$?

  if [ $${localPrefix}_status -eq 0 ] && [ -s "$${localPrefix}_cd_directive_file" ]; then
    IFS= read -r ${localPrefix}_destination < "$${localPrefix}_cd_directive_file" || true
    rm -f "$${localPrefix}_cd_directive_file"
    cd -- "$${localPrefix}_destination"
    return $?
  fi

  rm -f "$${localPrefix}_cd_directive_file"
  return $${localPrefix}_status
}`;
}

interface UnsupportedShellFailure {
	type: "unsupported_shell";
	message: string;
}

interface InstallMarkerBlockOptions {
	rcPath: string;
	beginMarker: string;
	payload: string;
	endMarker: string;
}

interface InstallMarkerBlockResult {
	rcPath: string;
	isAlreadyInstalled: boolean;
}

export function resolveRequestedShell(
	raw: string | undefined,
	env: Record<string, string | undefined>,
): { type: "ok"; shell: SupportedShell } | { type: "failure"; failure: UnsupportedShellFailure } {
	if (raw === undefined) return { type: "ok", shell: detectShell(env) };
	if (isSupportedShell(raw)) return { type: "ok", shell: raw };
	return { type: "failure", failure: unsupportedShellFailure(raw) };
}

function detectShell(env: Record<string, string | undefined>): SupportedShell {
	const shellName = basename(env.SHELL ?? "");
	if (isSupportedShell(shellName)) return shellName;
	return "zsh";
}

export function rcPathForShell(
	shell: SupportedShell,
	env: Record<string, string | undefined>,
): string {
	const home = env.HOME ?? homedir();
	return join(home, shell === "zsh" ? ".zshrc" : ".bashrc");
}

function buildMarkerBlock(options: {
	beginMarker: string;
	payload: string;
	endMarker: string;
}): string {
	return `\n${options.beginMarker}\n${trimTrailingNewline(options.payload)}\n${options.endMarker}\n`;
}

export async function installMarkerBlock(
	options: InstallMarkerBlockOptions,
): Promise<InstallMarkerBlockResult> {
	const existing = existsSync(options.rcPath) ? await readFile(options.rcPath, "utf8") : "";
	const bounds = managedRegionBounds({
		text: existing,
		startMarker: options.beginMarker,
		endMarker: options.endMarker,
	});
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
	return {
		type: "unsupported_shell",
		message: `Shell '${shell}' is not supported. Supported shells: zsh, bash.`,
	};
}

function trimTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value.slice(0, -1) : value;
}
