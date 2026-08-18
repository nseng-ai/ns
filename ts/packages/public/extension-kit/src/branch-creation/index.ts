export { createBranchWithProvider } from "./create.ts";
export { PlainGitBranchCreationProvider } from "./plain-git.ts";
export type { PlainGitBranchCreationGateway } from "./plain-git.ts";
export type {
	BranchCreationErrorInfo,
	BranchCreationGitGateway,
	BranchCreationOutcome,
	BranchCreationProvider,
	BranchCreationProviderId,
	BranchCreationProviderResult,
	BranchCreationRequest,
	KnownBranchCreationProviderId,
} from "./contract.ts";
