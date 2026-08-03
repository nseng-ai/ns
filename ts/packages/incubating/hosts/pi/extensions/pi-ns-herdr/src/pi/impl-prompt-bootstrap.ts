import {
	loadTrackedBranchPayload,
	TRACKED_BRANCH_PAYLOAD_KEY,
	TRACKED_BRANCH_PAYLOAD_NAMESPACE,
} from "@nseng-ai/extension-kit/tracked-branch-payload";

import { HERDR_IMPL_PROMPT_BRANCH_ENV } from "../core/impl-prompt-launch.ts";
import type { HerdrPiContext } from "./context.ts";

export interface HerdrImplPromptBootstrapOptions {
	/** Injectable environment for tests; production reads the process environment. */
	env?: Record<string, string | undefined>;
}

const PAYLOAD_LOCATOR = `${TRACKED_BRANCH_PAYLOAD_NAMESPACE}/${TRACKED_BRANCH_PAYLOAD_KEY}`;

export function buildDestinationImplementationPrompt(options: {
	cwd: string;
	expectedBranch: string;
	implementationPrompt: string;
}): string {
	return [
		"## Herdr destination execution context",
		"",
		"This is the destination implementation checkout.",
		`Destination session cwd: ${options.cwd}`,
		`Expected implementation branch: ${options.expectedBranch}`,
		"Use the destination session cwd as authoritative for repository work. Source-session checkout paths and absolute repository paths in the implementation prompt are context only; interpret and rebase repository paths relative to this destination repository root/cwd. Do not edit the source or old Slot merely because an inherited absolute source path appears. Normal repository instructions and validation still apply.",
		"",
		"## Implementation prompt",
		"",
		options.implementationPrompt,
	].join("\n");
}

/**
 * One-shot Herdr destination startup bootstrap. When the launching Herdr
 * session set the non-sensitive branch marker, the initial destination startup
 * verifies the checked-out branch, loads the retained Branch Memory entry
 * `ns-impl/prompt.md` directly through the Branch Memory command boundary, and
 * prepends destination-owned execution context before injecting the destination
 * session's first user prompt.
 *
 * The marker is consumed from the environment at registration so nested Pi
 * processes and extension reloads cannot replay it; the handler additionally
 * acts only on the initial `startup` session-start reason. This is internal
 * startup mechanics, not a command surface.
 */
export function registerHerdrImplPromptBootstrap(
	context: HerdrPiContext,
	options: HerdrImplPromptBootstrapOptions = {},
): void {
	const env = options.env ?? process.env;
	const marker = env[HERDR_IMPL_PROMPT_BRANCH_ENV];
	// One-shot consumption: this narrow composition boundary owns the only
	// direct environment mutation so child processes never inherit the marker.
	delete env[HERDR_IMPL_PROMPT_BRANCH_ENV];
	if (marker === undefined || marker.trim() === "") return;
	const expectedBranch = marker.trim();

	context.commands.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup") return;
		const current = await context.git.currentBranch({ cwd: ctx.cwd });
		if (current.type === "detached") {
			ctx.ui.notify(
				`Herdr expected branch ${expectedBranch} to load the stored implementation prompt, but HEAD is detached. Check out ${expectedBranch}, then read Branch Memory ${PAYLOAD_LOCATOR} manually.`,
				"error",
			);
			return;
		}
		if (current.type === "failure") {
			ctx.ui.notify(
				`Herdr could not resolve the current branch to load the stored implementation prompt for ${expectedBranch}: ${current.error.message}`,
				"error",
			);
			return;
		}
		if (current.branch !== expectedBranch) {
			ctx.ui.notify(
				`Herdr expected branch ${expectedBranch} to load the stored implementation prompt, but the current branch is ${current.branch}. Not loading the prompt.`,
				"error",
			);
			return;
		}
		const loaded = await loadTrackedBranchPayload(context.commands, {
			cwd: ctx.cwd,
			branchName: expectedBranch,
		});
		if (!loaded.ok) {
			// Deliberately payload-free: only the locator, branch, and failure
			// code — never Branch Memory content or raw command output.
			ctx.ui.notify(
				`Herdr could not load the implementation prompt from Branch Memory ${PAYLOAD_LOCATOR} on branch ${expectedBranch} (${loaded.error.code}). Inspect it with: brmem get ${TRACKED_BRANCH_PAYLOAD_KEY} --namespace ${TRACKED_BRANCH_PAYLOAD_NAMESPACE} --branch ${expectedBranch}`,
				"error",
			);
			return;
		}
		context.commands.sendUserMessage(
			buildDestinationImplementationPrompt({
				cwd: ctx.cwd,
				expectedBranch,
				implementationPrompt: loaded.content,
			}),
		);
	});
}
