export interface BrmemErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type BrmemResult<T> = { type: "ok"; value: T } | { type: "error"; error: BrmemErrorInfo };

export type BrmemOptionalResult<T> =
	| { type: "found"; value: T }
	| { type: "missing" }
	| { type: "error"; error: BrmemErrorInfo };

export function brmemOk<T>(value: T): BrmemResult<T> {
	return { type: "ok", value };
}

export function brmemError<T = never>(
	code: string,
	message: string,
	displayCommand?: string,
): BrmemResult<T> {
	return { type: "error", error: buildErrorInfo(code, message, displayCommand) };
}

export function brmemFound<T>(value: T): BrmemOptionalResult<T> {
	return { type: "found", value };
}

export function brmemMissing<T = never>(): BrmemOptionalResult<T> {
	return { type: "missing" };
}

export function brmemOptionalError<T = never>(
	code: string,
	message: string,
	displayCommand?: string,
): BrmemOptionalResult<T> {
	return { type: "error", error: buildErrorInfo(code, message, displayCommand) };
}

function buildErrorInfo(code: string, message: string, displayCommand?: string): BrmemErrorInfo {
	const error: BrmemErrorInfo = { code, message };
	if (displayCommand !== undefined) error.displayCommand = displayCommand;
	return error;
}
