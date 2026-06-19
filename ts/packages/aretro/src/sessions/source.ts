import type { SessionQuery, SessionQueryResult, SessionSourceInfo } from "./types.ts";

export interface SessionSource {
	readonly sourceInfo: SessionSourceInfo;
	query(query: SessionQuery): Promise<SessionQueryResult>;
}

export function limitSessions<TSession>(
	sessions: readonly TSession[],
	maxSessions: number,
): TSession[] {
	if (maxSessions <= 0) {
		return [];
	}
	return sessions.slice(0, maxSessions);
}
