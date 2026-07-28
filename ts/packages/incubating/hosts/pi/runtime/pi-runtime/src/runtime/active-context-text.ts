import {
	buildSessionContext,
	convertToLlm,
	serializeConversation,
} from "@earendil-works/pi-coding-agent";

import {
	formatError,
	openAuthoritativeSelectedPath,
	validateActiveSessionSourceRequest,
	type ActiveSessionSourceRequest,
} from "./active-session-source.ts";

export type { ActiveSessionSourceRequest } from "./active-session-source.ts";

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
	const requestFailure = validateActiveSessionSourceRequest(request);
	if (requestFailure !== undefined) return { ok: false, message: requestFailure };
	const opened = openAuthoritativeSelectedPath(request);
	return opened.ok ? { ok: true } : opened;
}

/** Builds inert model input from one persisted session's compaction-aware selected path. */
export function buildActiveSessionContextText(
	request: ActiveSessionSourceRequest,
): ActiveContextTextResult {
	const requestFailure = validateActiveSessionSourceRequest(request);
	if (requestFailure !== undefined) return { ok: false, message: requestFailure };
	const opened = openAuthoritativeSelectedPath(request);
	if (!opened.ok) return opened;
	try {
		const context = buildSessionContext(opened.source.getEntries(), request.sourceLeafId);
		return { ok: true, text: serializeConversation(convertToLlm(context.messages)) };
	} catch (error: unknown) {
		return {
			ok: false,
			message: `Failed to build active Pi session context: ${formatError(error)}`,
		};
	}
}
