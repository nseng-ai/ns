import { buildPiLaunchArgs, type PiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import { formatShellArg } from "@nseng-ai/foundation/command";

/**
 * Herdr-owned one-shot startup marker naming the destination branch whose
 * retained Branch Memory implementation prompt the destination bootstrap
 * should load. The marker carries only non-sensitive branch identity.
 */
export const HERDR_IMPL_PROMPT_BRANCH_ENV = "HERDR_IMPL_PROMPT_BRANCH";

/**
 * Builds the destination pane command for a tracked-branch implementation
 * prompt: a prompt-free Pi launch carrying only the startup marker plus the
 * source session's model/thinking options. The prompt itself stays in Branch
 * Memory; it never travels through the shell, environment values, temp files,
 * or `@file` arguments.
 */
export function buildHerdrImplPromptLaunchCommand(
	branchName: string,
	launchOptions: PiLaunchOptions,
): string {
	const piCommand = buildPiLaunchArgs(undefined, launchOptions).map(formatShellArg).join(" ");
	return `${HERDR_IMPL_PROMPT_BRANCH_ENV}=${formatShellArg(branchName)} exec ${piCommand}`;
}
