import type { ErrorInfo } from "@asdl/core/submit";

export type GatewayFailure = ErrorInfo & {
	stderr?: string | undefined;
	stdout?: string | undefined;
	returncode?: number | undefined;
};

export type CurrentBranchResult =
	| { type: "branch"; branch: string }
	| { type: "detached" }
	| { type: "failure"; failure: GatewayFailure };
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
