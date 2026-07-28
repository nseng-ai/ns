import { rmSync } from "node:fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { systemClock } from "@nseng-ai/foundation/time";

import {
	formatError,
	openAuthoritativeSelectedPath,
	validateActiveSessionSourceRequest,
} from "./active-session-source.ts";

export interface ActiveBranchCloneRequest {
	readonly sourceSessionFile: string;
	readonly sourceLeafId: string;
	readonly destinationCwd: string;
	readonly appendedUserTurn: string;
}

export interface ActiveBranchCloneEvidence {
	readonly sessionFile: string;
	readonly sessionId: string;
}

export type ActiveBranchCloneFailureCode = "invalid-request" | "session-clone-failed";

export interface ActiveBranchCloneFailure {
	readonly code: ActiveBranchCloneFailureCode;
	readonly message: string;
	readonly recoverableDestination?: ActiveBranchCloneEvidence;
}

export type ActiveBranchCloneResult =
	| { readonly ok: true; readonly value: ActiveBranchCloneEvidence }
	| { readonly ok: false; readonly error: ActiveBranchCloneFailure };

/**
 * Clones one authoritative Pi conversation path into a destination-worktree session.
 * The source manager is opened separately, so the caller's live session is never replaced.
 */
export function cloneActiveBranchSession(
	request: ActiveBranchCloneRequest,
): ActiveBranchCloneResult {
	const validationMessage = validateRequest(request);
	if (validationMessage !== undefined) {
		return { ok: false, error: { code: "invalid-request", message: validationMessage } };
	}
	const opened = openAuthoritativeSelectedPath(request);
	if (!opened.ok) {
		return { ok: false, error: { code: "invalid-request", message: opened.message } };
	}

	let intermediateSessionFile: string | undefined;
	let recoverableDestination: ActiveBranchCloneEvidence | undefined;
	try {
		intermediateSessionFile = opened.source.createBranchedSession(request.sourceLeafId);
		if (intermediateSessionFile === undefined) {
			return {
				ok: false,
				error: { code: "session-clone-failed", message: "Source session is not persisted." },
			};
		}

		const destination = SessionManager.forkFrom(intermediateSessionFile, request.destinationCwd);
		const sessionFile = destination.getSessionFile();
		if (sessionFile === undefined) {
			return {
				ok: false,
				error: {
					code: "session-clone-failed",
					message: "Destination session was not persisted.",
				},
			};
		}
		recoverableDestination = { sessionFile, sessionId: destination.getSessionId() };
		destination.appendMessage({
			role: "user",
			content: request.appendedUserTurn,
			timestamp: systemClock.nowMs(),
		});
		return {
			ok: true,
			value: recoverableDestination,
		};
	} catch (error: unknown) {
		return {
			ok: false,
			error: {
				code: "session-clone-failed",
				message: `Failed to clone active Pi session branch: ${formatError(error)}`,
				...(recoverableDestination === undefined ? {} : { recoverableDestination }),
			},
		};
	} finally {
		if (intermediateSessionFile !== undefined) {
			try {
				rmSync(intermediateSessionFile, { force: true });
			} catch {
				// The durable destination is more important than best-effort temporary cleanup.
			}
		}
	}
}

function validateRequest(request: ActiveBranchCloneRequest): string | undefined {
	const sourceValidationMessage = validateActiveSessionSourceRequest(request);
	if (sourceValidationMessage !== undefined) return sourceValidationMessage;
	if (request.destinationCwd.trim().length === 0) return "Destination cwd is required.";
	if (request.appendedUserTurn.trim().length === 0) return "Appended user turn is required.";
	return undefined;
}
