export {
	assertCleanRepo,
	assertLocalBranchExists,
	detectInProgressOperation,
	firstNonEmptyLine,
	loadCurrentBranch,
	loadLandingShape,
	loadLiveLocalBranches,
	loadLocalSha,
	loadRepoRoot,
	loadStackSnapshot,
	loadTrunk,
	resolveGitPath,
} from "sdl-flow/land-stack/stack-facts";
export type {
	DetectInProgressOperationOptions,
	LoadStackSnapshotOptions,
} from "sdl-flow/land-stack/stack-facts";
