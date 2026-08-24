export const GS_PROVIDER_VERSION = "0.1.0";

export interface GsProviderBranch {
	readonly name: string;
	readonly base: string;
	readonly needsRebase: boolean;
	readonly isCurrent: boolean;
}

export interface GsProviderTopology {
	readonly trunk: string;
	readonly currentBranch: string;
	readonly branches: readonly GsProviderBranch[];
}

export interface GsCommandDiagnostic {
	readonly command: string;
	readonly termination: string;
	readonly stdout: string;
	readonly stderr: string;
}

export type GsProviderResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: GsCommandDiagnostic };

export interface GsStackProviderGateway {
	readVersion(): Promise<GsProviderResult<string>>;
	readTopology(): Promise<GsProviderResult<GsProviderTopology>>;
	startRestack(scope: "full" | "downstack"): Promise<GsProviderResult<null>>;
	continueRestack(): Promise<GsProviderResult<null>>;
}
