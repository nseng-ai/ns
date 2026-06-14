import { mustEntryLocator, validateBranchName, type BrmemErrorInfo } from "@asdl/brmem";
import { failure, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";

import type { HandoffCliContext } from "../context.ts";
import { HANDOFF_NAMESPACE } from "../identity.ts";

export type Resolved<T> = { type: "resolved"; value: T } | ClinkrExit<never>;
export function resolved<T>(value: T): Resolved<T> {
	return { type: "resolved", value };
}

export async function resolveBranch(
	ctx: HandoffCliContext,
	requestedBranch: string | undefined,
	options: { detachedMessage: string },
): Promise<Resolved<string>> {
	if (requestedBranch !== undefined) {
		const validation = validateBranchName(requestedBranch);
		if (validation.type === "invalid") {
			return failure("invalid_branch_name", `Invalid branch name ${JSON.stringify(requestedBranch)}: ${validation.reason}`);
		}
		return resolved(requestedBranch);
	}

	const current = await ctx.git.currentBranch({ cwd: ctx.cwd });
	if (!current.ok) {
		if (current.error.code === "detached_head") return failure("detached_head", options.detachedMessage);
		return failure(current.error.code, current.error.message);
	}
	const validation = validateBranchName(current.value);
	if (validation.type === "invalid") return failure("invalid_branch_name", `Invalid branch name ${JSON.stringify(current.value)}: ${validation.reason}`);
	return resolved(current.value);
}

export function gatewayFailure(error: BrmemErrorInfo, prefix: string): ClinkrFailureExit {
	return failure(error.code, `${prefix}: ${error.message}`);
}

export function mustHandoffEntryLocator(key: string, branch: string): string {
	return mustEntryLocator(HANDOFF_NAMESPACE, key, branch);
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
