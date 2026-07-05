import type { GitErrorInfo } from "@nseng-ai/capability-kit/git";
import type { ErrorInfo } from "@nseng-ai/core/result";
import type { ExplicitUndefined } from "@nseng-ai/core/primitives";

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
