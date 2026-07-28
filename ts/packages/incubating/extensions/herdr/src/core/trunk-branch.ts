import type { GitGateway } from "@nseng-ai/foundation/git";

/**
 * Herdr trunk discovery is git-native: the repository trunk is the cached
 * `refs/remotes/origin/HEAD` branch, read locally without a network refresh.
 * Graphite's configured trunk is assumed to match; if the two diverge,
 * local-trunk implementation misbehaves — an accepted risk in exchange for
 * keeping Graphite out of trunk discovery entirely.
 */
export type HerdrTrunkBranchResolution =
	| { type: "resolved"; branch: string }
	| { type: "failed"; message: string };

export async function resolveRepoTrunkBranch(
	git: Pick<GitGateway, "cachedOriginHeadBranch">,
	options: { cwd: string },
): Promise<HerdrTrunkBranchResolution> {
	const result = await git.cachedOriginHeadBranch({ cwd: options.cwd });
	if (result.type === "found") return { type: "resolved", branch: result.value };
	if (result.type === "missing") {
		return {
			type: "failed",
			message:
				"Could not determine the repository trunk branch: refs/remotes/origin/HEAD is not set locally. Run `git remote set-head origin --auto`, then rerun.",
		};
	}
	return {
		type: "failed",
		message: `Could not determine the repository trunk branch. ${result.error.message}`,
	};
}
