export interface ErrorInfo {
	code: string;
	message: string;
	details?: Record<string, unknown>;
	displayCommand?: string;
}

export type Result<T, E extends ErrorInfo = ErrorInfo> =
	| { ok: true; value: T }
	| { ok: false; error: E };

export function resultOk<T>(value: T): Result<T> {
	return { ok: true, value };
}

export function resultErr<T = never, E extends ErrorInfo = ErrorInfo>(error: E): Result<T, E> {
	return { ok: false, error };
}

export { resultErr as err, resultOk as ok };
