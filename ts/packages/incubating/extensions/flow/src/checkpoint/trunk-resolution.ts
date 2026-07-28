import type { GitTrunkBranchResult } from "@nseng-ai/foundation/git";

export type RepositoryTrunkResolutionFailure = Exclude<GitTrunkBranchResult, { type: "resolved" }>;

export function formatRepositoryTrunkResolutionFailure(
	result: RepositoryTrunkResolutionFailure,
): string {
	switch (result.type) {
		case "selected-remote-invalid":
			return `Selected Git remote \`${result.remote}\` is invalid. ${result.error.message}`;
		case "configured-branch-invalid":
			return `Configured repository trunk \`${result.branch}\` is invalid. ${result.error.message}`;
		case "cached-remote-head-missing":
			return `Cached remote HEAD \`${result.remoteHeadRef}\` is missing. Fetch remote \`${result.remote}\`, or configure [git].trunk in ns.toml.`;
		case "cached-remote-head-malformed":
			return `Cached remote HEAD \`${result.remoteHeadRef}\` has malformed target ${JSON.stringify(result.target)}. Repair it, or configure [git].trunk in ns.toml.`;
		case "local-branch-missing":
			return `Repository trunk local ref \`${result.resolution.localRef}\` is missing. Create or fetch branch \`${result.resolution.branch}\`.`;
		case "remote-tracking-branch-missing":
			return `Repository trunk tracking ref \`${result.resolution.remoteTrackingRef}\` is missing. Fetch remote \`${result.resolution.remote}\`.`;
		case "command-failure":
			return `Repository trunk resolution failed while attempting to ${result.operation.replaceAll("-", " ")} (${result.reason}). ${result.error.message}`;
	}
}
