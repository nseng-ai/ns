import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { buildMarkerInstallSurface } from "../shell/marker-install-surface.ts";
import type { SupportedShell } from "../shell/rc-install.ts";

export const completionBeginMarker = "# >>> slot completion >>>";
export const completionEndMarker = "# <<< slot completion <<<";

export const completionShowRequestSchema = z.object({
	shell: z.string().optional().describe("Shell to render completion for (zsh or bash). Defaults from $SHELL, then zsh."),
});

export const completionInstallRequestSchema = completionShowRequestSchema;

export const completionShowResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	script: z.string(),
});

export const completionInstallResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	rc_path: z.string(),
	already_installed: z.boolean(),
});

export type CompletionShowRequest = z.infer<typeof completionShowRequestSchema>;
export type CompletionInstallRequest = z.infer<typeof completionInstallRequestSchema>;
export type CompletionShowResult = z.infer<typeof completionShowResultSchema>;
export type CompletionInstallResult = z.infer<typeof completionInstallResultSchema>;

const completionSurface = buildMarkerInstallSurface({
	beginMarker: completionBeginMarker,
	endMarker: completionEndMarker,
	renderPayload: renderCompletionScript,
	alreadyInstalledMessage: (result) => `slot completion already installed in ${result.rc_path}`,
	installedMessage: (result) => `Installed slot completion for ${result.shell} in ${result.rc_path}`,
});

export async function runCompletionShow(ctx: SlotCliContext, request: CompletionShowRequest) {
	return await completionSurface.runShow(ctx, request);
}

export async function runCompletionInstall(ctx: SlotCliContext, request: CompletionInstallRequest) {
	return await completionSurface.runInstall(ctx, request);
}

export function renderCompletionShow(result: CompletionShowResult): string {
	return completionSurface.renderShow(result);
}

export function renderCompletionInstall(result: CompletionInstallResult): string {
	return completionSurface.renderInstall(result);
}

export function renderCompletionScript(shell: SupportedShell): string {
	if (shell === "bash") return renderBashCompletionScript();
	return renderZshCompletionScript();
}

function renderZshCompletionScript(): string {
	return `#compdef slot

_slot_completion() {
  local -a commands
  commands=(
    'list:List worktree pool slots'
    'ls:Alias for list'
    'checkout:Check out a branch into a slot'
    'co:Alias for checkout'
    'goto:Print/copy a cd command for an assigned slot'
    'claim:Move a local branch into a slot'
    'free:Free assigned slots back to the pool'
    'gc:Free slots whose pull requests closed or merged'
    'init:Initialize the worktree pool'
    'resize:Grow or shrink the worktree pool'
    'shell:Show or install parent-shell integration'
    'completion:Show or install shell completion'
    'gt:Navigate and free Graphite-aware slot stacks'
  )
  _describe 'slot command' commands
}

compdef _slot_completion slot`;
}

function renderBashCompletionScript(): string {
	return `_slot_completion() {
  local cur commands
  cur="\${COMP_WORDS[COMP_CWORD]}"
  commands="list ls checkout co goto claim free gc init resize shell completion gt"
  COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
}

complete -F _slot_completion slot`;
}
