import type { GitCurrentBranchResult, GitErrorInfo } from "@asdl/core/git";
import type { ErrorInfo } from "@asdl/core/submit";

export type GatewayFailure = (ErrorInfo | GitErrorInfo) & {
	stderr?: string | undefined;
	stdout?: string | undefined;
	returncode?: number | undefined;
};

export type CurrentBranchResult = GitCurrentBranchResult;
export type RepoContextResult =
	| { type: "inside" }
	| { type: "outside" }
	| { type: "failure"; failure: GatewayFailure };

export interface GatewayOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}

export interface PrAddressGitGateway {
	getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult>;
	isInsideWorkTree(options: GatewayOptions): Promise<RepoContextResult>;
}
