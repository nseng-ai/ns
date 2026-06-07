// Compatibility shim: @asdl/ccc owns cmux command orchestration.
export {
	getGitRepositoryName,
	getWorktreeDescription,
	repositoryNameFromGitCommonDir,
	repositoryNameFromPath,
} from "../../../ccc/src/cmux/worktree-description.ts";
