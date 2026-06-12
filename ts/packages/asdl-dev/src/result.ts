export interface ErrorInfo {
	code: string;
	message: string;
	details?: Record<string, unknown>;
	displayCommand?: string;
}

export type GatewayResult<T> =
	| {
			ok: true;
			value: T;
	  }
	| {
			ok: false;
			error: ErrorInfo;
	  };

export function ok<T>(value: T): GatewayResult<T> {
	return { ok: true, value };
}

export function err<T = never>(error: ErrorInfo): GatewayResult<T> {
	return { ok: false, error };
}
