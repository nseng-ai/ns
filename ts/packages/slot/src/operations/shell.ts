import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { installMarkerBlock, rcPathForShell, resolveRequestedShell } from "../shell/rc-install.ts";

export const shellIntegrationBeginMarker = "# >>> slot shell integration >>>";
export const shellIntegrationEndMarker = "# <<< slot shell integration <<<";

export const shellShowRequestSchema = z.object({
	shell: z.string().optional().describe("Shell to render integration for (zsh or bash). Defaults from $SHELL, then zsh."),
});

export const shellInstallRequestSchema = shellShowRequestSchema;

export const shellShowResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	script: z.string(),
});

export const shellInstallResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	rc_path: z.string(),
	already_installed: z.boolean(),
});

export type ShellShowRequest = z.infer<typeof shellShowRequestSchema>;
export type ShellInstallRequest = z.infer<typeof shellInstallRequestSchema>;
export type ShellShowResult = z.infer<typeof shellShowResultSchema>;
export type ShellInstallResult = z.infer<typeof shellInstallResultSchema>;

export async function runShellShow(ctx: SlotCliContext, request: ShellShowRequest) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	return ok({ shell: selected.shell, script: renderShellWrapperScript() });
}

export async function runShellInstall(ctx: SlotCliContext, request: ShellInstallRequest) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	const rcPath = rcPathForShell(selected.shell, ctx.env);
	const installed = await installMarkerBlock({ rcPath, beginMarker: shellIntegrationBeginMarker, payload: renderShellWrapperScript(), endMarker: shellIntegrationEndMarker });
	return ok({ shell: selected.shell, rc_path: installed.rcPath, already_installed: installed.isAlreadyInstalled });
}

export function renderShellShow(result: ShellShowResult): string {
	return result.script;
}

export function renderShellInstall(result: ShellInstallResult): string {
	if (result.already_installed) return `slot shell integration already installed in ${result.rc_path}`;
	return `Installed slot shell integration for ${result.shell} in ${result.rc_path}`;
}

export function renderShellWrapperScript(): string {
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
