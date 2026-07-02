const STALE_EXTENSION_CONTEXT_MESSAGE = "This extension ctx is stale";

export type SafePiUiResult = { type: "ok" } | { type: "stale-context"; message: string };

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
		if (!isStaleExtensionContextError(error)) throw error;
		return { type: "stale-context", message: error.message };
	}
}

export function withSafePiUiValue<T>(action: () => T): SafePiUiValueResult<T> {
	try {
		return { type: "ok", value: action() };
	} catch (error) {
		if (!isStaleExtensionContextError(error)) throw error;
		return { type: "stale-context", message: error.message };
	}
}
