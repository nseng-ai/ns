import type { GitErrorInfo } from "@ns/capability-kit/git";
import type { ErrorInfo } from "@ns/core/result";
import type { ExplicitUndefined } from "@ns/core/primitives";

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
	env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
}
