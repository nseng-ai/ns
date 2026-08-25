import type { GsAutobranchResult } from "./autobranch-contract.ts";

export function renderGsAutobranchHuman(data: GsAutobranchResult): string {
	return [
		`${data.outcome}: ${data.path ?? "unclassified"}`,
		`Provider worktree: ${data.providerWorktreeGitDir ?? "unknown"}`,
		`Source: ${data.source ?? "unknown"}@${data.sourceSha ?? "unknown"}`,
		`Child: ${data.child ?? "unprepared"}@${data.childSha ?? "unknown"}`,
		`Dirtiness: ${data.dirty.staged} staged, ${data.dirty.unstaged} unstaged, ${data.dirty.untracked} untracked`,
		`Effects: ${data.effects.length === 0 ? "none" : data.effects.join(", ")}`,
		...(data.diagnostic === null ? [] : [`Observation: ${data.diagnostic}`]),
		`Recovery: ${data.recovery.instruction}`,
	].join("\n");
}
