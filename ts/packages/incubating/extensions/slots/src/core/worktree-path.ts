import { posix } from "node:path";

import type { Result } from "@nseng-ai/foundation/result";

import { extractSlotNumber, generateSlotName } from "./naming.ts";

export interface ManagedSlotWorktreeRootParseFailure {
	readonly code: "not-managed-slot-worktree-root";
	readonly message: string;
}

export type ManagedSlotWorktreeRootParseResult = Result<
	string,
	ManagedSlotWorktreeRootParseFailure
>;

/**
 * Returns the canonical Slot name for an exact managed Slot worktree root.
 *
 * Recognition is lexical only: this function normalizes the candidate path but
 * performs no filesystem access or symlink resolution.
 */
export function parseManagedSlotWorktreeRoot(
	worktreeRoot: string,
): ManagedSlotWorktreeRootParseResult {
	const normalizedWorktreeRoot = posix.resolve(worktreeRoot.replaceAll("\\", "/"));
	const slotName = posix.basename(normalizedWorktreeRoot);
	const worktreesDir = posix.dirname(normalizedWorktreeRoot);
	const repoDir = posix.dirname(worktreesDir);
	const reposDir = posix.dirname(repoDir);
	const slotsDir = posix.dirname(reposDir);

	if (posix.basename(worktreesDir) !== "worktrees") return notManagedSlotWorktreeRoot(worktreeRoot);
	if (posix.basename(repoDir).length === 0) return notManagedSlotWorktreeRoot(worktreeRoot);
	if (posix.basename(reposDir) !== "repos") return notManagedSlotWorktreeRoot(worktreeRoot);
	if (posix.basename(slotsDir) !== "slots") return notManagedSlotWorktreeRoot(worktreeRoot);

	const slotNumber = extractSlotNumber(slotName);
	if (slotNumber === null || slotNumber === "00") {
		return notManagedSlotWorktreeRoot(worktreeRoot);
	}
	return { ok: true, value: generateSlotName(Number(slotNumber)) };
}

function notManagedSlotWorktreeRoot(worktreeRoot: string): ManagedSlotWorktreeRootParseResult {
	return {
		ok: false,
		error: {
			code: "not-managed-slot-worktree-root",
			message: `Path is not an exact managed Slot worktree root: ${worktreeRoot}`,
		},
	};
}
