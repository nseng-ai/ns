import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { buildMarkerBlock, homeFromEnv, installRcBlock, resolveShell } from "../shell/rc-block.ts";

export const SLOT_SHELL_MARKER_BEGIN = "# >>> slot shell integration >>>";
export const SLOT_SHELL_MARKER_END = "# <<< slot shell integration <<<";

export const shellRequestSchema = z.object({
	shell: z.string().optional().describe("Shell to render/install integration for (zsh or bash; default: detect from $SHELL)."),
});

export const shellShowResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	script: z.string(),
});

export const shellInstallResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	rc_path: z.string(),
	already_installed: z.boolean(),
});

export type ShellRequest = z.infer<typeof shellRequestSchema>;
export type ShellShowResult = z.infer<typeof shellShowResultSchema>;
export type ShellInstallResult = z.infer<typeof shellInstallResultSchema>;

export function renderWrapperScript(): string {
	return `slot() {
  local _slot_cd_directive_file
  local _slot_status
  local _slot_destination

  _slot_cd_directive_file="$(mktemp "\${TMPDIR:-/tmp}/slot-cd.XXXXXX")" || return 1
  SLOT_CD_DIRECTIVE_FILE="$_slot_cd_directive_file" command slot "$@"
  _slot_status=$?

  if [ $_slot_status -eq 0 ] && [ -s "$_slot_cd_directive_file" ]; then
    IFS= read -r _slot_destination < "$_slot_cd_directive_file"
    rm -f "$_slot_cd_directive_file"
    cd -- "$_slot_destination"
    return $?
  fi

  rm -f "$_slot_cd_directive_file"
  return $_slot_status
}`;
}

export function shellMarkerBlock(): string {
	return buildMarkerBlock(SLOT_SHELL_MARKER_BEGIN, renderWrapperScript(), SLOT_SHELL_MARKER_END);
}

export async function runShellShow(ctx: SlotCliContext, request: ShellRequest) {
	const resolved = resolveShell(request.shell, ctx.env);
	if (resolved.type === "failure") return failure(resolved.errorType, resolved.message);
	return ok({ shell: resolved.shell, script: renderWrapperScript() });
}

export async function runShellInstall(ctx: SlotCliContext, request: ShellRequest) {
	const resolved = resolveShell(request.shell, ctx.env);
	if (resolved.type === "failure") return failure(resolved.errorType, resolved.message);
	const result = await installRcBlock({ shell: resolved.shell, home: homeFromEnv(ctx.env), beginMarker: SLOT_SHELL_MARKER_BEGIN, markerBlock: shellMarkerBlock(), filesystem: ctx.rc });
	return ok({ shell: resolved.shell, rc_path: result.rcPath, already_installed: result.alreadyInstalled });
}

export function renderShellShow(result: ShellShowResult): string {
	return result.script;
}

export function renderShellInstall(result: ShellInstallResult): string {
	if (result.already_installed) return `slot shell integration already installed in ${result.rc_path}`;
	return `Installed slot shell integration in ${result.rc_path}\nRun \`source ${result.rc_path}\` or open a new shell to activate.`;
}
