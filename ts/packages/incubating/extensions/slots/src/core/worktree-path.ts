import { basename, dirname, resolve } from "node:path";

import { extractSlotNumber, generateSlotName } from "./naming.ts";

/**
 * Returns the canonical Slot name for a managed Slot worktree root.
 *
 * Recognition is lexical only: this function normalizes the candidate path but
 * performs no filesystem access or symlink resolution.
 */
export function parseManagedSlotWorktreeRoot(worktreeRoot: string): string | undefined {
	const normalizedWorktreeRoot = resolve(worktreeRoot);
	const worktreesDir = dirname(normalizedWorktreeRoot);
	const repoDir = dirname(worktreesDir);
	const reposDir = dirname(repoDir);
	const slotsDir = dirname(reposDir);

	if (basename(worktreesDir) !== "worktrees") return undefined;
	if (basename(repoDir).length === 0) return undefined;
	if (basename(reposDir) !== "repos") return undefined;
	if (basename(slotsDir) !== "slots") return undefined;

	const slotNumber = extractSlotNumber(basename(normalizedWorktreeRoot));
	if (slotNumber === null) return undefined;
	return generateSlotName(Number(slotNumber));
}
