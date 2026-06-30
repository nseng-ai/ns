import type { GitErrorInfo } from "@sdl/git";
import type { ErrorInfo } from "@sdl/core/result";

export type GatewayFailure = (ErrorInfo | GitErrorInfo) & {
	stderr?: string;
	stdout?: string;
	returncode?: number;
};

export type RepoContextResult =
	| { type: "inside" }
	| { type: "outside" }
	| { type: "failure"; failure: GatewayFailure };

export interface GatewayOptions {
	cwd: string;
	// optional-undefined-objective: preserve (env-map) — Gateway/subprocess options bag where an absent/undefined env means inherit the full process env, a domain distinction passed through to `gh`/git execution.
	env?: NodeJS.ProcessEnv | undefined;
}
