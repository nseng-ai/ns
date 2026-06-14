import { buildEntryLocator, validateBranchName, type BrmemErrorInfo } from "@asdl/brmem";
import { failure, type ClinkrExit } from "@asdl/clinkr";

import type { HandoffCliContext } from "../context.ts";
import { HANDOFF_NAMESPACE } from "../identity.ts";

export type ResolvedBranch = { type: "resolved"; branch: string } | ClinkrExit<never>;

export async function resolveBranch(
	ctx: HandoffCliContext,
	requestedBranch: string | undefined,
	options: { detachedMessage: string },
): Promise<ResolvedBranch> {
	if (requestedBranch !== undefined) {
		const validation = validateBranchName(requestedBranch);
		if (validation.type === "invalid") {
			return failure("invalid_branch_name", `Invalid branch name ${JSON.stringify(requestedBranch)}: ${validation.reason}`);
		}
		return { type: "resolved", branch: requestedBranch };
	}

	const current = await ctx.git.currentBranch({ cwd: ctx.cwd });
	if (!current.ok) {
		if (current.error.code === "detached_head") return failure("detached_head", options.detachedMessage);
		return failure(current.error.code, current.error.message);
	}
	const validation = validateBranchName(current.value);
	if (validation.type === "invalid") return failure("invalid_branch_name", `Invalid branch name ${JSON.stringify(current.value)}: ${validation.reason}`);
	return { type: "resolved", branch: current.value };
}

export function gatewayFailure<T>(error: BrmemErrorInfo, prefix: string): ClinkrExit<T> {
	return failure(error.code, `${prefix}: ${error.message}`);
}

export function handoffEntryLocator(key: string, branch: string): string | ClinkrExit<never> {
	const locator = buildEntryLocator(HANDOFF_NAMESPACE, key, branch);
	if (locator.type === "error") return failure(locator.error.code, locator.error.message);
	return locator.value;
}

export async function confirmFromStdin(options: {
	stdin: () => Promise<string>;
	stderr: (text: string) => void;
	prompt: string;
}): Promise<"yes" | "no" | ClinkrExit<never>> {
	options.stderr(options.prompt);
	const input = await options.stdin();
	const lines = input.split(/\r?\n/);
	for (const rawLine of lines) {
		const value = rawLine.trim().toLowerCase();
		if (value === "y" || value === "yes") return "yes";
		if (value === "" || value === "n" || value === "no") return "no";
		options.stderr("Error: invalid input\n");
		options.stderr(options.prompt);
	}
	return failure("aborted", "Aborted!");
}
