import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import { buildCli } from "../cli.ts";
import type { SlotCliContext } from "../context.ts";
import { buildMarkerBlock, homeFromEnv, installRcBlock, resolveShell } from "../shell/rc-block.ts";

export const SLOT_COMPLETION_MARKER_BEGIN = "# >>> slot completion >>>";
export const SLOT_COMPLETION_MARKER_END = "# <<< slot completion <<<";

export const completionRequestSchema = z.object({
	shell: z.string().optional().describe("Shell to render/install completion for (zsh or bash; default: detect from $SHELL)."),
});

export const completionShowResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	script: z.string(),
});

export const completionInstallResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	rc_path: z.string(),
	already_installed: z.boolean(),
});

export type CompletionRequest = z.infer<typeof completionRequestSchema>;
export type CompletionShowResult = z.infer<typeof completionShowResultSchema>;
export type CompletionInstallResult = z.infer<typeof completionInstallResultSchema>;

export function renderCompletionScript(shell: "zsh" | "bash"): string {
	return buildCli().shellCompletionScript(shell, "slot");
}

export function completionMarkerBlock(shell: "zsh" | "bash"): string {
	return buildMarkerBlock(SLOT_COMPLETION_MARKER_BEGIN, renderCompletionScript(shell), SLOT_COMPLETION_MARKER_END);
}

export async function runCompletionShow(ctx: SlotCliContext, request: CompletionRequest) {
	const resolved = resolveShell(request.shell, ctx.env);
	if (resolved.type === "failure") return failure(resolved.errorType, resolved.message);
	return ok({ shell: resolved.shell, script: renderCompletionScript(resolved.shell) });
}

export async function runCompletionInstall(ctx: SlotCliContext, request: CompletionRequest) {
	const resolved = resolveShell(request.shell, ctx.env);
	if (resolved.type === "failure") return failure(resolved.errorType, resolved.message);
	const result = await installRcBlock({ shell: resolved.shell, home: homeFromEnv(ctx.env), beginMarker: SLOT_COMPLETION_MARKER_BEGIN, markerBlock: completionMarkerBlock(resolved.shell), filesystem: ctx.rc });
	return ok({ shell: resolved.shell, rc_path: result.rcPath, already_installed: result.alreadyInstalled });
}

export function renderCompletionShow(result: CompletionShowResult): string {
	return result.script;
}

export function renderCompletionInstall(result: CompletionInstallResult): string {
	if (result.already_installed) return `slot completion already installed in ${result.rc_path}`;
	return `Installed slot completion in ${result.rc_path}\nRun \`source ${result.rc_path}\` or open a new shell to activate.`;
}
