import {
	buildSessionContext,
	convertToLlm,
	serializeConversation,
	SessionManager,
} from "@earendil-works/pi-coding-agent";

export interface ActiveSessionSourceRequest {
	readonly sourceSessionFile: string;
	readonly sourceLeafId: string;
}

export type ActiveSessionSourcePreflightResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly message: string };

export type ActiveContextTextResult =
	| { readonly ok: true; readonly text: string }
	| { readonly ok: false; readonly message: string };

/** Validates persisted source readability and its authoritative selected path without serializing it. */
export function preflightActiveSessionSource(
	request: ActiveSessionSourceRequest,
): ActiveSessionSourcePreflightResult {
	const requestFailure = validateRequest(request);
	if (requestFailure !== undefined) return { ok: false, message: requestFailure };
	try {
		const source = SessionManager.open(request.sourceSessionFile);
		const selectedPath = source.getBranch(request.sourceLeafId);
		if (source.getEntry(request.sourceLeafId) === undefined) {
			return {
				ok: false,
				message: `Source session leaf ${JSON.stringify(request.sourceLeafId)} does not exist.`,
			};
		}
		if (selectedPath.length === 0) {
			return { ok: false, message: "Source session branch is empty." };
		}
		if (selectedPath.at(-1)?.id !== request.sourceLeafId) {
			return {
				ok: false,
				message: `Source session selected path does not end at authoritative leaf ${JSON.stringify(request.sourceLeafId)}.`,
			};
		}
		return { ok: true };
	} catch (error: unknown) {
		return {
			ok: false,
			message: `Failed to read active Pi session source: ${formatError(error)}`,
		};
	}
}

/** Builds inert model input from one persisted session's compaction-aware selected path. */
export function buildActiveSessionContextText(
	request: ActiveSessionSourceRequest,
): ActiveContextTextResult {
	const preflight = preflightActiveSessionSource(request);
	if (!preflight.ok) return preflight;
	try {
		const source = SessionManager.open(request.sourceSessionFile);
		const context = buildSessionContext(source.getEntries(), request.sourceLeafId);
		return { ok: true, text: serializeConversation(convertToLlm(context.messages)) };
	} catch (error: unknown) {
		return {
			ok: false,
			message: `Failed to build active Pi session context: ${formatError(error)}`,
		};
	}
}

function validateRequest(request: ActiveSessionSourceRequest): string | undefined {
	if (request.sourceSessionFile.trim().length === 0) return "Source session file is required.";
	if (request.sourceLeafId.trim().length === 0) return "Source session leaf id is required.";
	return undefined;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
