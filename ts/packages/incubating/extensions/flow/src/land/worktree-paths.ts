import type { WorktreeConflict } from "./types.ts";

export function slotFreeArgs(conflicts: readonly WorktreeConflict[]): string[] {
	const args = ["free"];
	const seenSlots = new Set<string>();
	const seenBranches = new Set<string>();

	for (const conflict of conflicts) {
		if (conflict.type === "managed-slot") {
			if (!seenSlots.has(conflict.slotName)) {
				seenSlots.add(conflict.slotName);
				args.push("--wt", conflict.slotName);
			}
			continue;
		}

		if (!seenBranches.has(conflict.branch)) {
			seenBranches.add(conflict.branch);
			args.push("--branch", conflict.branch);
		}
	}

	return args;
}

export function formatManualWorktreeConflict(conflicts: readonly WorktreeConflict[]): string {
	if (conflicts.length === 1) {
		const conflict = conflicts[0];
		return `Branch ${conflict?.branch ?? "unknown"} is checked out in non-slot worktree ${conflict?.path ?? "unknown"}; detach it manually and rerun.`;
	}
	return [
		"Relevant branches are checked out in non-slot worktrees; detach them manually and rerun:",
		...conflicts.map((conflict) => `- ${conflict.branch} ${conflict.path}`),
	].join("\n");
}

export function formatSlotConflict(conflict: WorktreeConflict): string {
	return conflict.type === "managed-slot"
		? `${conflict.slotName} ${conflict.branch} ${conflict.path}`
		: `${conflict.branch} ${conflict.path}`;
}

export function formatConflict(conflict: WorktreeConflict): string {
	if (conflict.type === "managed-slot") return formatSlotConflict(conflict);
	return `${conflict.branch} ${conflict.path} (${conflict.type})`;
}
