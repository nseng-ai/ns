export interface ErrorInfo<Details extends object = Record<string, unknown>> {
	code: string;
	message: string;
	details?: Details;
	displayCommand?: string;
}

export interface ErrorDetailTextOptions {
	// optional-undefined-objective: preserve (null-tolerant-input) — This is a deliberately tolerant input union (string | null | undefined) that accepts loosely-typed/nullable command output; dropping `| undefined` while keeping `| null` is incoherent and callers forward possibly-undefined values.
	readonly stderr?: string | null | undefined;
	// optional-undefined-objective: preserve (null-tolerant-input) — Same tolerant `string | null | undefined` input union as stderr, intentionally accepting null and undefined interchangeably for loosely-typed command output.
	readonly stdout?: string | null | undefined;
	// optional-undefined-objective: preserve (null-tolerant-input) — Tolerant `string | null | undefined` input field; callers (exec-operation.ts) forward a possibly-undefined `input.message`, and the null branch must remain, so the undefined is not pure redundancy.
	readonly message?: string | null | undefined;
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
