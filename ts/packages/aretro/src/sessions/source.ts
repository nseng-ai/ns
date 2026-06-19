import type { SessionQuery, SessionQueryResult } from "./types.ts";

export interface SessionSource {
	readonly sourceInfo: { harness: string; adapter_name: string; record_format: string };
	query(query: SessionQuery): Promise<SessionQueryResult>;
}
