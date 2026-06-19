import type { SessionQuery, SessionQueryResult, SessionSourceInfo } from "./types.ts";

export interface SessionSource {
	readonly sourceInfo: SessionSourceInfo;
	query(query: SessionQuery): Promise<SessionQueryResult>;
}
