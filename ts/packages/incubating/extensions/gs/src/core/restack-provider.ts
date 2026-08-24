export const GS_RESTACK_PROVIDER_VERSION = "0.1.0";

export interface GsProviderDiagnostic {
	readonly command: string;
	readonly termination: string;
	readonly stdout: string;
	readonly stderr: string;
}

export type GsProviderResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly diagnostic: GsProviderDiagnostic };

export interface GsRestackProviderGateway {
	readVersion(): Promise<GsProviderResult<string>>;
	start(scope: "full" | "downstack"): Promise<GsProviderResult<null>>;
	continue(): Promise<GsProviderResult<null>>;
}
