export const GS_RESTACK_VERSION = "0.1.0";

export interface GsRestackDiagnostic {
	readonly command: string;
	readonly termination: string;
	readonly stdout: string;
	readonly stderr: string;
}

export type GsRestackGatewayResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly diagnostic: GsRestackDiagnostic };

export interface GsRestackGateway {
	readVersion(): Promise<GsRestackGatewayResult<string>>;
	start(scope: "full" | "downstack"): Promise<GsRestackGatewayResult<null>>;
	continue(): Promise<GsRestackGatewayResult<null>>;
}
