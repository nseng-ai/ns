const STALE_EXTENSION_CONTEXT_MESSAGE = "This extension ctx is stale";

interface SafePiUiStaleContextResult {
	type: "stale-context";
	message: string;
}

export type SafePiUiResult = { type: "ok" } | SafePiUiStaleContextResult;

export type SafePiUiValueResult<T> =
	| { type: "ok"; value: T }
	| { type: "stale-context"; message: string };

export function isStaleExtensionContextError(error: unknown): error is Error {
	return error instanceof Error && error.message.includes(STALE_EXTENSION_CONTEXT_MESSAGE);
}

export function withSafePiUi(action: () => void): SafePiUiResult {
	try {
		action();
		return { type: "ok" };
	} catch (error) {
		return staleContextResult(error);
	}
}

export async function withSafePiUiAsync(action: () => Promise<void>): Promise<SafePiUiResult> {
	try {
		await action();
		return { type: "ok" };
	} catch (error) {
		return staleContextResult(error);
	}
}

export function withSafePiUiValue<T>(action: () => T): SafePiUiValueResult<T> {
	try {
		return { type: "ok", value: action() };
	} catch (error) {
		return staleContextResult(error);
	}
}

function staleContextResult(error: unknown): SafePiUiStaleContextResult {
	if (!isStaleExtensionContextError(error)) throw error;
	return { type: "stale-context", message: error.message };
}
