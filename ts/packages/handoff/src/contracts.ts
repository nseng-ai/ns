export interface HandoffErrorInfo {
	code: string;
	message: string;
	displayCommand?: string | undefined;
}

export type HandoffResult<T> = { type: "ok"; value: T } | { type: "error"; error: HandoffErrorInfo };

export type HandoffOptionalResult<T> =
	| { type: "found"; value: T }
	| { type: "missing" }
	| { type: "error"; error: HandoffErrorInfo };

export function handoffOk<T>(value: T): HandoffResult<T> {
	return { type: "ok", value };
}

export function handoffError<T = never>(code: string, message: string, displayCommand?: string): HandoffResult<T> {
	const error: HandoffErrorInfo = { code, message };
	if (displayCommand !== undefined) error.displayCommand = displayCommand;
	return { type: "error", error };
}

export function handoffFound<T>(value: T): HandoffOptionalResult<T> {
	return { type: "found", value };
}

export function handoffMissing<T = never>(): HandoffOptionalResult<T> {
	return { type: "missing" };
}

export function handoffOptionalError<T = never>(
	code: string,
	message: string,
	displayCommand?: string,
): HandoffOptionalResult<T> {
	const error: HandoffErrorInfo = { code, message };
	if (displayCommand !== undefined) error.displayCommand = displayCommand;
	return { type: "error", error };
}
