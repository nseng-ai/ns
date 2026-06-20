export interface ErrorInfo<Details extends object = Record<string, unknown>> {
	code: string;
	message: string;
	details?: Details;
	displayCommand?: string;
}

export type Result<T, E extends ErrorInfo<object> = ErrorInfo> =
	| { ok: true; value: T }
	| { ok: false; error: E };

export function resultOk<T, E extends ErrorInfo<object> = ErrorInfo>(value: T): Result<T, E> {
	return { ok: true, value };
}

export function resultErr<T = never, E extends ErrorInfo<object> = ErrorInfo>(
	error: E,
): Result<T, E> {
	return { ok: false, error };
}

export { resultErr as err, resultOk as ok };
