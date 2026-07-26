import type { ExplicitUndefined } from "./primitives.ts";
export interface ErrorInfo<Details extends object = Record<string, unknown>> {
	code: string;
	message: string;
	details?: Details;
	displayCommand?: string;
}

export interface ErrorDetailTextOptions {
	readonly stderr?: ExplicitUndefined<"null-tolerant-input", string | null>;
	readonly stdout?: ExplicitUndefined<"null-tolerant-input", string | null>;
	readonly message?: ExplicitUndefined<"null-tolerant-input", string | null>;
	readonly fallback: string;
}

export function errorDetailText(options: ErrorDetailTextOptions): string {
	const stderr = nonBlankString(options.stderr);
	if (stderr !== undefined) return stderr;
	const stdout = nonBlankString(options.stdout);
	if (stdout !== undefined) return stdout;
	const message = nonBlankString(options.message);
	if (message !== undefined) return message;
	return options.fallback;
}

function nonBlankString(value: string | null | undefined): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.trim() === "" ? undefined : value;
}

export type ResultOk<T> = { ok: true; value: T };

export type ResultErr<E extends ErrorInfo<object> = ErrorInfo> = { ok: false; error: E };

export type Result<T, E extends ErrorInfo<object> = ErrorInfo> = ResultOk<T> | ResultErr<E>;

export function resultOk<T>(value: T): ResultOk<T> {
	return { ok: true, value };
}

export function resultErr<E extends ErrorInfo<object> = ErrorInfo>(error: E): ResultErr<E> {
	return { ok: false, error };
}

export function resultErrOf<Code extends string>(
	code: Code,
	message: string,
): ResultErr<{ code: Code; message: string }> {
	return resultErr({ code, message });
}

export { resultErr as err, resultOk as ok };
