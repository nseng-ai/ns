import type { GitErrorInfo } from "@sdl/core/git";
import type { ErrorInfo } from "@sdl/core/result";

export type GatewayFailure = (ErrorInfo | GitErrorInfo) & {
	stderr?: string | undefined;
	stdout?: string | undefined;
	returncode?: number | undefined;
};

export type RepoContextResult =
	| { type: "inside" }
	| { type: "outside" }
	| { type: "failure"; failure: GatewayFailure };

export interface GatewayOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}
